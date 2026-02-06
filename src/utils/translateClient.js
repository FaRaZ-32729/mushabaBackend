process.env.GOOGLE_APPLICATION_CREDENTIALS;

const fs = require('fs');
const path = require('path');
const { TranslationServiceClient } = require('@google-cloud/translate').v3;

const translateClient = new TranslationServiceClient();

async function translate_Text(text, targetLanguage, sourceLanguage) {
    if (!text || !targetLanguage) {
        throw new Error('Missing required parameters: text and targetLanguage');
    }

    const location = 'global';
    const projectId = await translateClient.getProjectId();
    const request = {
        parent: `projects/${projectId}/locations/${location}`,
        contents: [text],
        mimeType: 'text/plain',
        targetLanguageCode: targetLanguage
    };
    if (sourceLanguage) request.sourceLanguageCode = sourceLanguage;

    const [response] = await translateClient.translateText(request);
    const translations = (response.translations || []);
    const translatedText = translations.map(t => t.translatedText || '').join('\n');
    return translatedText;
}

async function detect_Language(text) {
    if (!text) return undefined;
    const location = 'global';
    const projectId = await translateClient.getProjectId();
    const request = {
        parent: `projects/${projectId}/locations/${location}`,
        content: text,
    };
    const [response] = await translateClient.detectLanguage(request);
    const languages = (response.languages || []);
    // Pick the highest confidence language
    const best = languages.sort((a, b) => (Number(b.confidence || 0) - Number(a.confidence || 0)))[0];
    return best && best.languageCode ? best.languageCode : undefined;
}

module.exports = {
    translate_Text,
    detect_Language
};