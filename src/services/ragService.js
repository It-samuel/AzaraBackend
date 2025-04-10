const axios = require('axios');
const config = require('../config/azure');

const AZURE_OPENAI_DEPLOYMENT = config.openai.deploymentName;
const AZURE_OPENAI_ENDPOINT = config.openai.endpoint;
const AZURE_OPENAI_API_KEY = config.openai.key;
const AZURE_SEARCH_ENDPOINT = config.search.endpoint;
const AZURE_SEARCH_API_KEY = config.search.key;
const AZURE_SEARCH_INDEX_NAME = config.search.indexName;


// Create RAG prompt using retrieved documents
function buildRagPrompt(query, documents) {
  const context = documents.map(doc => doc.content || doc.text || '').join('\n');
  return `
You are an intelligent assistant. Use the following context to answer the question as best as you can.

Context:
${context}

Question: ${query}
Answer:
  `.trim();
}

async function retrieveFromSearch(query) {
  const response = await axios.post(
    `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/docs/search?api-version=2023-07-01-preview`,
    {
      search: query,
      top: 5
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_SEARCH_API_KEY
      }
    }
  );

  return response.data.value;
}

async function generateAnswer(query) {
  // Step 1: Get related documents
  const docs = await retrieveFromSearch(query);

  // Step 2: Build prompt
  const prompt = buildRagPrompt(query, docs);

  // Step 3: Send to Azure OpenAI
  const completionRes = await axios.post(
    `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
    {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY
      }
    }
  );

  const answer = completionRes.data.choices[0].message.content;
  return answer;
}

module.exports = {
  generateAnswer
};
