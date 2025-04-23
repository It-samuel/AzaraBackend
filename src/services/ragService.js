// Enhanced services/ragService.js
const axios = require('axios');
const config = require('../config/azure');
const logger = require('../utils/logger');

const AZURE_OPENAI_DEPLOYMENT = config.openai.deploymentName;
const AZURE_OPENAI_ENDPOINT = config.openai.endpoint;
const AZURE_OPENAI_API_KEY = config.openai.key;
const AZURE_SEARCH_ENDPOINT = config.search.endpoint;
const AZURE_SEARCH_API_KEY = config.search.key;
const AZURE_SEARCH_INDEX_NAME = config.search.indexName;

// Create RAG prompt using retrieved documents
function buildRagPrompt(query, documents) {
  if (!documents || documents.length === 0) {
    return `
You are an intelligent assistant. Answer the following question based on your knowledge:

Question: ${query}
Answer:
    `.trim();
  }

  const context = documents
    .map(doc => {
      // Handle different document structures
      const content = doc.content || doc.text || doc.document || '';
      const source = doc.metadata?.source || doc.source || 'Unknown source';
      return `Source: ${source}\nContent: ${content}`;
    })
    .join('\n\n');

  return `
You are an intelligent assistant. Use the following context to answer the question as accurately as possible. If the context doesn't contain enough information to answer the question, say so and provide what relevant information you can.

Context:
${context}

Question: ${query}

Instructions:
- Answer based primarily on the provided context
- If the context is insufficient, acknowledge this limitation
- Keep your answer concise but comprehensive
- Cite sources when relevant

Answer:
  `.trim();
}

async function retrieveFromSearch(query, options = {}) {
  try {
    const {
      top = 5,
      searchMode = 'any',
      queryType = 'simple',
      select = null,
      filter = null
    } = options;

    logger.info('Searching Azure Cognitive Search', { 
      query: query.substring(0, 100),
      top,
      searchMode
    });

    const searchPayload = {
      search: query,
      top,
      searchMode,
      queryType
    };

    // Add optional parameters
    if (select) searchPayload.select = select;
    if (filter) searchPayload.filter = filter;

    const response = await axios.post(
      `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/docs/search?api-version=2023-07-01-preview`,
      searchPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_SEARCH_API_KEY
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const documents = response.data.value || [];
    
    logger.info('Search completed', {
      resultsCount: documents.length,
      totalResults: response.data['@odata.count'] || 'unknown'
    });

    return documents;
  } catch (error) {
    logger.error('Azure Search error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Return empty array instead of throwing to allow fallback to general knowledge
    return [];
  }
}

async function generateAnswer(query, options = {}) {
  try {
    const {
      temperature = 0.3,
      maxTokens = 800,
      searchOptions = {},
      includeContext = false
    } = options;

    logger.info('Generating RAG answer', { 
      query: query.substring(0, 100),
      temperature,
      maxTokens
    });

    // Step 1: Get related documents from search
    const startTime = Date.now();
    const docs = await retrieveFromSearch(query, searchOptions);
    const searchTime = Date.now() - startTime;

    // Step 2: Build prompt with context
    const prompt = buildRagPrompt(query, docs);
    
    logger.info('Built RAG prompt', {
      documentsFound: docs.length,
      promptLength: prompt.length,
      searchTime
    });

    // Step 3: Send to Azure OpenAI
    const completionStartTime = Date.now();
    const completionRes = await axios.post(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful and knowledgeable assistant. Provide accurate, concise, and helpful responses based on the context provided.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_API_KEY
        },
        timeout: 60000 // 60 second timeout
      }
    );

    const completionTime = Date.now() - completionStartTime;
    const answer = completionRes.data.choices[0].message.content;

    logger.info('RAG answer generated successfully', {
      answerLength: answer.length,
      completionTime,
      totalTime: Date.now() - startTime,
      tokensUsed: completionRes.data.usage
    });

    // Return enhanced response
    const response = {
      answer: answer.trim(),
      query,
      documentsFound: docs.length,
      timing: {
        searchTime,
        completionTime,
        totalTime: Date.now() - startTime
      },
      usage: completionRes.data.usage
    };

    // Include context if requested (useful for debugging)
    if (includeContext) {
      response.context = {
        documents: docs.map(doc => ({
          content: (doc.content || doc.text || '').substring(0, 200) + '...',
          source: doc.metadata?.source || doc.source || 'Unknown',
          score: doc['@search.score']
        })),
        prompt: prompt.substring(0, 500) + '...'
      };
    }

    return response;

  } catch (error) {
    logger.error('RAG generation error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      query: query.substring(0, 100)
    });

    // Provide fallback response
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please check your API keys.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. The service is taking too long to respond.');
    } else {
      throw new Error(`RAG service error: ${error.message}`);
    }
  }
}

// Backward compatibility - keep the original function name
async function generateAnswerSimple(query) {
  try {
    const result = await generateAnswer(query);
    return result.answer;
  } catch (error) {
    logger.error('Simple RAG generation error:', error);
    throw error;
  }
}

// Validate search index health
async function validateSearchIndex() {
  try {
    const response = await axios.get(
      `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/stats?api-version=2023-07-01-preview`,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_SEARCH_API_KEY
        }
      }
    );

    return {
      healthy: true,
      documentCount: response.data.documentCount,
      storageSize: response.data.storageSize
    };
  } catch (error) {
    logger.error('Search index validation error:', error);
    return {
      healthy: false,
      error: error.message
    };
  }
}

// Test Azure OpenAI connection
async function validateOpenAI() {
  try {
    const response = await axios.post(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        messages: [
          { role: 'user', content: 'Hello, this is a test. Please respond with "Test successful".' }
        ],
        max_tokens: 10,
        temperature: 0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_API_KEY
        }
      }
    );

    return {
      healthy: true,
      model: response.data.model,
      response: response.data.choices[0].message.content
    };
  } catch (error) {
    logger.error('OpenAI validation error:', error);
    return {
      healthy: false,
      error: error.message
    };
  }
}

module.exports = {
  generateAnswer,
  generateAnswer: generateAnswerSimple, // For backward compatibility
  retrieveFromSearch,
  buildRagPrompt,
  validateSearchIndex,
  validateOpenAI
};