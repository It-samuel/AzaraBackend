module.exports = {
  speech: {
    key: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION
  },
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    key: process.env.AZURE_OPENAI_API_KEY,
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT // Fixed: matches your .env
  },
  search: {
    endpoint: process.env.AZURE_SEARCH_ENDPOINT,
    key: process.env.AZURE_SEARCH_API_KEY,
    indexName: process.env.AZURE_SEARCH_INDEX_NAME
  },
  storage: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'voice-files'
  }
};