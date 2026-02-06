process.env.GOOGLE_APPLICATION_CREDENTIALS;

const { SpeechClient } = require('@google-cloud/speech');

const speechClient = new SpeechClient();

function ensureBase64(input) {
    if (!input) return '';
    if (typeof input === 'string') {
        if (input.startsWith('data:')) {
            const parts = input.split(',');
            return parts[1] || '';
        }
        return input;
    }
    if (Buffer.isBuffer(input)) return input.toString('base64');
    if (input instanceof Uint8Array) return Buffer.from(input).toString('base64');
    return '';
}

async function speech_To_Text(data, options = {}) {
    const {
        languageCode = 'en-US',
        audioEncoding, // e.g., 'MP3', 'OGG_OPUS', 'WEBM_OPUS', 'LINEAR16', 'FLAC'
        sampleRateHertz,
        model,
        enableWordTimeOffsets = false,
        enableAutomaticPunctuation = true,
        profanityFilter = false,
        audioChannelCount,
        alternativeLanguageCodes,
        useLongRunning = false
    } = options;

    const config = {
        languageCode,
        enableAutomaticPunctuation,
        profanityFilter
    };

    if (audioEncoding) config.encoding = audioEncoding;
    if (sampleRateHertz) config.sampleRateHertz = sampleRateHertz;
    if (typeof audioChannelCount === 'number') config.audioChannelCount = audioChannelCount;
    if (enableWordTimeOffsets) config.enableWordTimeOffsets = true;
    if (model) config.model = model;
    if (Array.isArray(alternativeLanguageCodes) && alternativeLanguageCodes.length > 0) {
        config.alternativeLanguageCodes = alternativeLanguageCodes;
    }

    const audio = { content: ensureBase64(data) };
    if (!audio.content) {
        throw new Error('Invalid or empty audio content');
    }

    const request = { config, audio };
    let response;
    if (useLongRunning) {
        const [operation] = await speechClient.longRunningRecognize(request);
        const [opResponse] = await operation.promise();
        response = opResponse;
    } else {
        const [syncResponse] = await speechClient.recognize(request);
        response = syncResponse;
    }

    const transcript = (response.results || [])
        .map(r => (r.alternatives && r.alternatives[0] && r.alternatives[0].transcript) || '')
        .filter(Boolean)
        .join(' ')
        .trim();

    let detectedLanguageCode;
    try {
        const first = (response.results && response.results[0]) || {};
        detectedLanguageCode = first.languageCode
            || (first.alternatives && first.alternatives[0] && first.alternatives[0].languageCode)
            || undefined;
    } catch (_) {
        // ignore
    }

    return {
        transcript,
        detectedLanguageCode,
        results: response.results || []
    };
}

module.exports = speech_To_Text;