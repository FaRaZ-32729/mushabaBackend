const { inferSttEncodingFromDataUri, maybeTranscodeToOggOpus } = require('../services/speechAndPipelineServices');
const speech_To_Text = require('../utils/speechClient');
const text_To_Speech = require('../utils/ttsClient');


// POST /api/speech/stt  { data: base64 | dataURI, sttLanguageCode?, audioEncoding? }
const handleSpeechToText = async (req, res) => {
    try {
        const { data, sttLanguageCode, audioEncoding, sampleRateHertz, model, alternativeLanguageCodes } = req.body || {};
        if (!data) return res.status(400).json({ success: false, message: 'Missing data' });
        const isDataUri = typeof data === 'string' && data.startsWith('data:');
        const finalData = isDataUri ? (await maybeTranscodeToOggOpus(data)) || data : data;
        const encoding = audioEncoding || (isDataUri ? inferSttEncodingFromDataUri(finalData) : undefined);
        const stt = await speech_To_Text(finalData, {
            languageCode: sttLanguageCode || 'en-US',
            audioEncoding: encoding,
            sampleRateHertz,
            model,
            alternativeLanguageCodes: Array.isArray(alternativeLanguageCodes) ? alternativeLanguageCodes : undefined
        });
        return res.json({ success: true, transcript: stt.transcript, detectedLanguageCode: stt.detectedLanguageCode, results: stt.results });
    } catch (e) {
        console.error('[SPEECH_STT] error:', e);
        return res.status(500).json({ success: false, message: 'STT error' });
    }
};

// POST /api/speech/tts  { text, languageCode, ssmlGender?, audioEncoding? }
const handleTextToSpeech = async (req, res) => {
    try {
        const { text, languageCode, ssmlGender = 'NEUTRAL', audioEncoding = 'MP3', voiceName } = req.body || {};
        if (!text || !languageCode) return res.status(400).json({ success: false, message: 'Missing text or languageCode' });
        const buf = await text_To_Speech(text, voiceName, languageCode, ssmlGender, audioEncoding);
        const contentType = audioEncoding === 'MP3' ? 'audio/mpeg' : audioEncoding === 'OGG_OPUS' ? 'audio/ogg' : audioEncoding === 'LINEAR16' ? 'audio/wav' : 'application/octet-stream';
        if (String(req.query.base64 || '') === '1') {
            return res.json({ success: true, base64: buf.toString('base64'), contentType });
        }
        res.set('Content-Type', contentType);
        return res.send(buf);
    } catch (e) {
        console.error('[SPEECH_TTS] error:', e);
        return res.status(500).json({ success: false, message: 'TTS error' });
    }
};

module.exports = { handleSpeechToText, handleTextToSpeech };


