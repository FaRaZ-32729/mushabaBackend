const express = require('express');
const fs = require('fs');
const path = require('path');
const { translate_Text } = require('../utils/translateClient');

const router = express.Router();
router.use(express.json({ limit: '5mb' }));

const translateText = async (req, res) => {
    try {
        const { text, targetLanguage, sourceLanguage } = req.body || {};
        if (!text || !targetLanguage) {
            return res.status(400).json({ success: false, message: 'Missing required fields: text, targetLanguage' });
        }
        const translatedText = await translate_Text(text, targetLanguage, sourceLanguage);
        return res.json({ success: true, translatedText });
    } catch (error) {
        console.error('Error translating text:', error);
        return res.status(500).json({ success: false, message: 'Error translating text' });
    }
};

const translateToFile = async (req, res) => {
    try {
        const {
            text,
            inputFilePath,
            targetLanguage,
            sourceLanguage,
            outputDir,
            outputFileName
        } = req.body || {};

        if ((!text && !inputFilePath) || !targetLanguage) {
            return res.status(400).json({ success: false, message: 'Missing required fields: (text or inputFilePath) and targetLanguage' });
        }

        const serverRoot = path.join(__dirname, '..');
        let inputText = text;
        if (!inputText && inputFilePath) {
            const absInputPath = path.isAbsolute(inputFilePath) ? inputFilePath : path.join(serverRoot, inputFilePath);
            if (!fs.existsSync(absInputPath)) {
                return res.status(404).json({ success: false, message: `Input file not found: ${absInputPath}` });
            }
            inputText = fs.readFileSync(absInputPath, 'utf8');
        }

        const translatedText = await translate_Text(inputText, targetLanguage, sourceLanguage);

        const defaultOutDir = path.join(serverRoot, 'uploads', 'translated');
        const finalOutDir = outputDir ? (path.isAbsolute(outputDir) ? outputDir : path.join(serverRoot, outputDir)) : defaultOutDir;
        if (!fs.existsSync(finalOutDir)) {
            fs.mkdirSync(finalOutDir, { recursive: true });
        }

        const fileBase = outputFileName && outputFileName.trim().length > 0
            ? outputFileName.trim()
            : `translated_${Date.now()}_${targetLanguage}.txt`;
        const absOutputPath = path.join(finalOutDir, fileBase);
        fs.writeFileSync(absOutputPath, translatedText, 'utf8');

        let publicUrl = null;
        const uploadsDir = path.join(serverRoot, 'uploads');
        if (absOutputPath.startsWith(uploadsDir)) {
            publicUrl = '/uploads' + absOutputPath.substring(uploadsDir.length).replace(/\\/g, '/');
        }

        return res.json({
            success: true,
            translatedText,
            absolutePath: absOutputPath,
            fileUrl: publicUrl
        });
    } catch (error) {
        console.error('Error translating text to file:', error);
        return res.status(500).json({ success: false, message: 'Error translating text to file' });
    }
};

module.exports = {
    translateText,
    translateToFile
};