process.env.GOOGLE_APPLICATION_CREDENTIALS;

const textToSpeech = require('@google-cloud/text-to-speech');

const google_tts_Client = new textToSpeech.TextToSpeechClient();

// Cache Standard voice choices per language to minimize listVoices calls
const standardVoiceCache = new Map(); // key: `${languageCode}|${ssmlGender||'ANY'}` => voiceName

function ensureBuffer(audioContent) {
    if (!audioContent) return Buffer.alloc(0);
    if (Buffer.isBuffer(audioContent)) return audioContent;
    if (typeof audioContent === 'string') return Buffer.from(audioContent, 'base64');
    if (audioContent instanceof Uint8Array) return Buffer.from(audioContent);
    return Buffer.alloc(0);
}

async function resolveStandardVoiceName(languageCode, ssmlGender) {
    if (!languageCode) return undefined;
    const key = `${languageCode}|${ssmlGender || 'ANY'}`;
    if (standardVoiceCache.has(key)) return standardVoiceCache.get(key);

    try {
        const [result] = await google_tts_Client.listVoices({ languageCode });
        const voices = (result && result.voices) || [];
        // Prefer Standard voices; optionally match gender if provided
        const candidates = voices.filter(v => v.name && v.name.includes('-Standard-'));
        let chosen;
        if (ssmlGender) {
            const g = String(ssmlGender).toUpperCase();
            chosen = candidates.find(v => String(v.ssmlGender).toUpperCase() === g) || candidates[0];
        } else {
            chosen = candidates[0];
        }
        const name = chosen && chosen.name;
        if (name) {
            standardVoiceCache.set(key, name);
            return name;
        }
        // If no Standard available, fall back to first available voice
        const fallback = voices[0] && voices[0].name;
        if (fallback) {
            standardVoiceCache.set(key, fallback);
            return fallback;
        }
    } catch (e) {
        // Ignore and fall through
    }
    return undefined;
}

async function text_To_Speech(text, name, languageCode, ssmlGender = 'NEUTRAL', audioEncoding = 'MP3') {
    let finalName = name;
    if (!finalName) {
        finalName = await resolveStandardVoiceName(languageCode, ssmlGender);
    }

    const request = {
        input: { text },
        voice: { languageCode, name: finalName, ssmlGender },
        audioConfig: { audioEncoding },
    };
    const [response] = await google_tts_Client.synthesizeSpeech(request);
    return ensureBuffer(response.audioContent);
}


module.exports = text_To_Speech;