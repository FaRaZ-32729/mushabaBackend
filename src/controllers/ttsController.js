const text_To_Speech = require('../utils/ttsClient');


const generateAudio = async (req, res) => {
    const text = req.body.text;
    const name = req.body.name;
    const languageCode = req.body.languageCode;
    const ssmlGender = req.body.ssmlGender;
    const audioEncoding = req.body.audioEncoding || 'MP3';

    try {
        const audioData = await text_To_Speech(text, name, languageCode, ssmlGender, audioEncoding);

        const contentType = audioEncoding === 'MP3' ? 'audio/mpeg'
            : audioEncoding === 'OGG_OPUS' ? 'audio/ogg'
                : audioEncoding === 'LINEAR16' ? 'audio/wav'
                    : 'application/octet-stream';

        // Optional: return base64 JSON when requested (easier for mobile clients)
        if (String(req.query.base64 || '').trim() === '1') {
            const base64 = audioData.toString('base64');
            return res.json({ success: true, contentType, base64 });
        }

        res.set('Content-Type', contentType);
        res.send(audioData);
    } catch (error) {
        console.error('Error generating audio:', error);
        res.status(500).send('Error generating audio');
    }
};

module.exports = generateAudio;