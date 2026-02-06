const speech_To_Text = require("../utils/speechClient");

const transcribeAudio = async (req, res) => {
    try {
        const {
            data,
            languageCode,
            audioEncoding,
            sampleRateHertz,
            model,
            enableWordTimeOffsets,
            enableAutomaticPunctuation,
            profanityFilter,
            audioChannelCount,
            alternativeLanguageCodes,
            useLongRunning
        } = req.body || {};

        if (!data) {
            return res.status(400).json({ success: false, message: 'Missing required field: data (base64 audio)' });
        }

        const result = await speech_To_Text(data, {
            languageCode,
            audioEncoding,
            sampleRateHertz,
            model,
            enableWordTimeOffsets,
            enableAutomaticPunctuation,
            profanityFilter,
            audioChannelCount,
            alternativeLanguageCodes,
            useLongRunning
        });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error transcribing audio:', error);
        res.status(500).json({ success: false, message: 'Error transcribing audio' });
    }
};

module.exports = transcribeAudio;