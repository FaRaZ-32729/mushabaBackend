const speech_To_Text = require('../utils/speechClient');
const { translate_Text, detect_Language } = require('../utils/translateClient');
const text_To_Speech = require('../utils/ttsClient');
const { detectLanguageFromDataUri } = require('./lid');
const { inferSttEncodingFromDataUri, maybeTranscodeToOggOpus } = require('./speechAndPipelineServices');
//inuse
function toShortLanguageCode(languageTag) {
    if (!languageTag || typeof languageTag !== 'string') return undefined;
    const tag = languageTag.trim();
    const special = {
        'zh-CN': 'zh-CN',
        'zh-TW': 'zh-TW',
        'pt-BR': 'pt',
        'pt-PT': 'pt'
    };
    if (special[tag]) return special[tag];
    const dashIndex = tag.indexOf('-');
    return dashIndex > 0 ? tag.substring(0, dashIndex) : tag;
}
// inuse
function isoToBcp47Preferred(iso) {
    if (!iso) return undefined;
    const s = iso.trim().toLowerCase();
    // preferred defaults for common languages
    const map = {
        en: 'en-US',
        ur: 'ur-PK',
        ar: 'ar-XA',
        de: 'de-DE',
        es: 'es-ES',
        fr: 'fr-FR',
        it: 'it-IT',
        pt: 'pt-BR',
        zh: 'zh-CN',
        hi: 'hi-IN',
        bn: 'bn-BD',
        ru: 'ru-RU',
        tr: 'tr-TR',
        id: 'id-ID',
    };
    // If not in map, return the short ISO (STT generally accepts base language)
    return map[s] || s;
}
// inuse
function normalizeSttLanguageCode(lang) {
    if (!lang) return lang;
    const lc = lang.trim();
    // Fix common STT-incompatible codes
    if (/^ar-XA$/i.test(lc)) return 'ar-SA'; // choose Saudi as default regional Arabic
    if (/^zh-CN$/i.test(lc)) return 'cmn-Hans-CN'; // Mandarin Simplified (STT)
    if (/^zh-TW$/i.test(lc)) return 'cmn-Hant-TW'; // Mandarin Traditional (STT)
    return lc;
}

function getContentTypeForEncoding(audioEncoding) {
    const enc = (audioEncoding || 'MP3').toUpperCase();
    if (enc === 'MP3') return 'audio/mpeg';
    if (enc === 'OGG_OPUS') return 'audio/ogg';
    if (enc === 'LINEAR16') return 'audio/wav';
    return 'application/octet-stream';
}




const tts_sttPipeline = async (req, res) => {
    try {
        const {
            data,
            sttLanguageCode,
            sttAudioEncoding,
            sampleRateHertz,
            model,
            enableWordTimeOffsets,
            enableAutomaticPunctuation,
            profanityFilter,
            audioChannelCount,
            translateTargetLanguage,
            translateSourceLanguage,
            ttsLanguageCode,
            ttsVoiceName,
            ttsSsmlGender,
            ttsAudioEncoding,
            useLongRunning,
            // New bidirectional inputs
            languageA,
            languageB,
            autoDetectUnknown,
            conversationId,
            knownLanguageA,
            partnerLanguagePreferred,
            resetUnknown,
            proposedLanguageB
        } = req.body || {};

        if (!data) {
            return res.status(400).json({ success: false, message: 'Missing required field: data' });
        }

        const isBidirectional = Boolean(languageA && languageB);
        const isUnknownVsKnown = Boolean(autoDetectUnknown && conversationId && knownLanguageA);
        if (!isBidirectional && !isUnknownVsKnown) {
            if (!sttLanguageCode || !translateTargetLanguage || !ttsLanguageCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: (sttLanguageCode, translateTargetLanguage, ttsLanguageCode) or provide (languageA, languageB) for bidirectional mode or (autoDetectUnknown, conversationId, knownLanguageA)'
                });
            }
        }

        // 1) Speech-to-Text
        // Transcode if needed for iOS m4a/aac/mp4 to improve STT compatibility
        const maybeTranscoded = await maybeTranscodeToOggOpus(data).catch(() => null);
        const finalData = maybeTranscoded || data;
        const inferredEncoding = sttAudioEncoding || inferSttEncodingFromDataUri(finalData) || (maybeTranscoded ? 'OGG_OPUS' : undefined);
        let sttResult;
        if (isBidirectional) {
            // Single STT with A as primary and B as alternative to classify spoken language
            const sttCommon = {
                audioEncoding: inferredEncoding,
                sampleRateHertz,
                model,
                enableWordTimeOffsets,
                enableAutomaticPunctuation,
                profanityFilter,
                audioChannelCount,
                useLongRunning
            };

            const sttRes = await speech_To_Text(finalData, {
                languageCode: languageA,
                alternativeLanguageCodes: [languageB],
                ...sttCommon
            });
            sttResult = sttRes;
            if (!sttRes.detectedLanguageCode) {
                const guess = await detect_Language(sttRes.transcript || '');
                if (guess) sttResult.detectedLanguageCode = guess;
            }
        } else if (isUnknownVsKnown) {
            // Any-language detection for unknown vs known
            console.log('[PIPELINE_DEBUG] Unknown vs Known mode activated');
            console.log('[PIPELINE_DEBUG] knownLanguageA:', knownLanguageA);
            console.log('[PIPELINE_DEBUG] partnerLanguagePreferred:', partnerLanguagePreferred);
            console.log('[PIPELINE_DEBUG] conversationId:', conversationId);

            // Cache storage (in-memory) for conversation languageB and confidence
            global.__convCache = global.__convCache || new Map();
            const cache = global.__convCache;

            if (resetUnknown) {
                cache.delete(conversationId);
            }

            let cached = cache.get(conversationId);
            // Seed from explicit proposals or partnerPreferred
            let languageBCode = proposedLanguageB || partnerLanguagePreferred || languageB || (cached && cached.languageB) || undefined;
            let lidFirst = null;
            if (!languageBCode) {
                // Detect on this utterance to seed other language
                lidFirst = await detectLanguageFromDataUri(finalData);
                if (lidFirst && lidFirst.language) {
                    const guessB = isoToBcp47Preferred(lidFirst.language);
                    if (toShortLanguageCode(guessB) !== toShortLanguageCode(knownLanguageA)) {
                        languageBCode = guessB;
                        cached = {
                            languageBISO: lidFirst.language,
                            confidenceB: typeof lidFirst.confidence === 'number' ? lidFirst.confidence : undefined,
                            languageB: guessB
                        };
                        cache.set(conversationId, cached);
                    }
                }
            }

            // Single STT with known A and alt B
            const sttCommon = {
                audioEncoding: inferredEncoding,
                sampleRateHertz,
                model,
                enableWordTimeOffsets,
                enableAutomaticPunctuation,
                profanityFilter,
                audioChannelCount,
                useLongRunning
            };

            const altCodes = [];
            const normA = normalizeSttLanguageCode(knownLanguageA);
            const normB = languageBCode ? normalizeSttLanguageCode(languageBCode) : undefined;

            // Add common languages as alternatives for better auto-detection
            // Prioritize English first for better detection
            const commonLanguages = ['en-US', 'ar-SA', 'es-ES', 'fr-FR', 'de-DE', 'zh-CN', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR'];
            const aShort = toShortLanguageCode(normA);

            // Add common languages as alternatives (excluding the known language)
            commonLanguages.forEach(lang => {
                const langShort = toShortLanguageCode(lang);
                if (langShort !== aShort && !altCodes.includes(lang)) {
                    altCodes.push(lang);
                }
            });

            // If the known language is Hindi/Urdu, prioritize English detection
            if (aShort === 'hi' || aShort === 'ur') {
                // Move English to the front for better detection
                const enIndex = altCodes.indexOf('en-US');
                if (enIndex > 0) {
                    altCodes.splice(enIndex, 1);
                    altCodes.unshift('en-US');
                }
            }

            // Add the specific partner language if provided
            if (normB && toShortLanguageCode(normB) !== aShort) {
                altCodes.push(normB);
            }

            console.log('[PIPELINE_DEBUG] STT Configuration:');
            console.log('[PIPELINE_DEBUG] knownLanguageA:', knownLanguageA);
            console.log('[PIPELINE_DEBUG] normA (primary STT language):', normA);
            console.log('[PIPELINE_DEBUG] languageBCode:', languageBCode);
            console.log('[PIPELINE_DEBUG] normB (alternative STT language):', normB);
            console.log('[PIPELINE_DEBUG] altCodes (alternative languages):', altCodes);
            let sttRes = await speech_To_Text(finalData, {
                languageCode: normA,
                alternativeLanguageCodes: altCodes,
                ...sttCommon
            });

            console.log('[PIPELINE_DEBUG] STT Result:');
            console.log('[PIPELINE_DEBUG] transcript:', sttRes.transcript);
            console.log('[PIPELINE_DEBUG] detectedLanguageCode:', sttRes.detectedLanguageCode);

            // // Enhanced fallback for Urdu and other aggressive models
            // const shouldTryFallback = (!sttRes.transcript || sttRes.transcript.length === 0) ||
            //     (toShortLanguageCode(normA) === 'ur' && !sttRes.detectedLanguageCode);

            // if (shouldTryFallback && normB) {
            // Simple fallback: if no transcript and we have a partner B, retry once with B primary
            if ((!sttRes.transcript || sttRes.transcript.length === 0) && normB) {
                const altBack = [];
                if (normA && toShortLanguageCode(normA) !== toShortLanguageCode(normB)) altBack.push(normA);
                // const fallbackRes = await speech_To_Text(finalData, {
                sttRes = await speech_To_Text(finalData, {
                    languageCode: normB,
                    alternativeLanguageCodes: altBack,
                    ...sttCommon
                });

                // // For Urdu primary: prefer fallback if it has better language detection
                // if (toShortLanguageCode(normA) === 'ur' && fallbackRes.detectedLanguageCode && 
                //     toShortLanguageCode(fallbackRes.detectedLanguageCode) !== 'ur') {
                //     sttRes = fallbackRes;
                // } else if (!sttRes.transcript || sttRes.transcript.length === 0) {
                //     sttRes = fallbackRes;
                // }
            }

            sttResult = sttRes;
            // If detection is unclear, fallback to LID snippet
            if (!sttRes.detectedLanguageCode) {
                const lid2 = lidFirst || await detectLanguageFromDataUri(finalData);
                if (lid2 && lid2.language) sttResult.detectedLanguageCode = lid2.language;
            }

            // Additional fallback: if detected language seems wrong, try to correct it
            if (sttResult.detectedLanguageCode && sttResult.transcript) {
                const detected = sttResult.detectedLanguageCode.toLowerCase();
                const transcript = sttResult.transcript.toLowerCase();

                // Check if transcript contains English words written in Hindi script
                const englishInHindiScript = [
                    'व्हाट', 'हाउ', 'व्हेयर', 'व्हेन', 'व्हाई', 'हू', 'यूअर', 'नेम', 'आर', 'यू', 'गोइंग',
                    'हैलो', 'हाय', 'थैंक', 'यू', 'प्लीज', 'सॉरी', 'ओके', 'यस', 'नो', 'गुड', 'बैड'
                ];

                const hasEnglishInHindiScript = englishInHindiScript.some(word => transcript.includes(word));

                // If detected as Hindi but contains English words in Hindi script, likely English
                if (detected.includes('hi') && hasEnglishInHindiScript) {
                    console.log('[PIPELINE_DEBUG] Correcting Hindi detection to English - transcript contains English words in Hindi script');
                    sttResult.detectedLanguageCode = 'en-US';
                }

                // If detected as Chinese but transcript contains English words, likely English
                if (detected.includes('cmn') || detected.includes('zh')) {
                    const englishWords = ['the', 'and', 'you', 'are', 'is', 'what', 'where', 'how', 'when', 'why'];
                    const hasEnglishWords = englishWords.some(word => transcript.includes(word));
                    if (hasEnglishWords) {
                        console.log('[PIPELINE_DEBUG] Correcting Chinese detection to English based on transcript content');
                        sttResult.detectedLanguageCode = 'en-US';
                    }
                }
            }
        } else {
            sttResult = await speech_To_Text(finalData, {
                languageCode: sttLanguageCode,
                audioEncoding: inferredEncoding,
                sampleRateHertz,
                model,
                enableWordTimeOffsets,
                enableAutomaticPunctuation,
                profanityFilter,
                audioChannelCount,
                useLongRunning
            });
        }

        const transcript = (sttResult && sttResult.transcript) || '';
        if (!transcript) {
            return res.status(400).json({ success: false, message: 'No transcript detected from audio' });
        }

        // 2) Translate
        let translatedText;
        if (isBidirectional) {
            // Decide target based on detected spoken language
            const detected = sttResult.detectedLanguageCode || toShortLanguageCode(languageA);
            const detectedShort = toShortLanguageCode(detected);
            const langAShort = toShortLanguageCode(languageA);
            const langBShort = toShortLanguageCode(languageB);
            // If speaker used A -> translate to B; else translate to A
            const targetShort = detectedShort === langAShort ? langBShort : langAShort;
            const targetForTts = targetShort === langAShort ? languageA : languageB;

            // Check if source and target are the same - if so, skip translation
            if (detectedShort === targetShort) {
                console.log(`[PIPELINE] Skipping translation - source and target are the same: ${detectedShort}`);
                // Just return the original transcript without translation
                const finalAudioEncoding = ttsAudioEncoding || 'MP3';
                const audioBuffer = await text_To_Speech(
                    transcript, // Use original transcript instead of translated
                    ttsVoiceName,
                    targetForTts,
                    ttsSsmlGender,
                    finalAudioEncoding
                );
                const audioContentType = getContentTypeForEncoding(finalAudioEncoding);

                return res.json({
                    success: true,
                    transcript,
                    detectedLanguageCode: sttResult.detectedLanguageCode,
                    translatedText: transcript, // Same as transcript since no translation needed
                    audioContent: (audioBuffer || Buffer.alloc(0)).toString('base64'),
                    audioContentType
                });
            }

            translatedText = await translate_Text(transcript, targetShort, detectedShort);

            // 3) TTS in the matching BCP-47 code of the target language
            const finalAudioEncoding = ttsAudioEncoding || 'MP3';
            const audioBuffer = await text_To_Speech(
                translatedText,
                ttsVoiceName,
                targetForTts,
                ttsSsmlGender,
                finalAudioEncoding
            );
            const audioContentType = getContentTypeForEncoding(finalAudioEncoding);

            return res.json({
                success: true,
                transcript,
                detectedLanguageCode: sttResult.detectedLanguageCode,
                translatedText,
                audioContent: (audioBuffer || Buffer.alloc(0)).toString('base64'),
                audioContentType
            });
        } else if (isUnknownVsKnown) {
            const detected = sttResult.detectedLanguageCode || toShortLanguageCode(knownLanguageA);
            const detectedShort = toShortLanguageCode(detected);
            const aShort = toShortLanguageCode(knownLanguageA);
            // Pick opposite as target
            global.__convCache = global.__convCache || new Map();

            // Clean up old cache entries (older than 5 minutes)
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000);
            for (const [id, data] of global.__convCache.entries()) {
                if (data.lastUpdated && data.lastUpdated < fiveMinutesAgo) {
                    global.__convCache.delete(id);
                    console.log('[PIPELINE_DEBUG] Cleaned up old cache entry:', id);
                }
            }

            // Clear cache if language has changed (detect by checking if cached language matches current knownLanguageA)
            const cached = global.__convCache.get(conversationId) || {};
            if (cached.languageB && toShortLanguageCode(cached.languageB) === toShortLanguageCode(knownLanguageA)) {
                console.log('[PIPELINE_DEBUG] Clearing cache - language mismatch detected');
                global.__convCache.delete(conversationId);
            }

            const freshCached = global.__convCache.get(conversationId) || {};

            console.log('[PIPELINE_DEBUG] Conversation Cache:');
            console.log('[PIPELINE_DEBUG] conversationId:', conversationId);
            console.log('[PIPELINE_DEBUG] cached data:', freshCached);
            console.log('[PIPELINE_DEBUG] partnerLanguagePreferred:', partnerLanguagePreferred);
            console.log('[PIPELINE_DEBUG] languageB:', freshCached.languageB);

            let bCode = freshCached.languageB || partnerLanguagePreferred || languageB;
            // If B is still undefined or equals A, try to derive from detected when different from A
            if (!bCode && detectedShort !== aShort) bCode = isoToBcp47Preferred(detectedShort);
            if (!bCode) bCode = knownLanguageA; // fallback for this turn
            const bShort = toShortLanguageCode(bCode);

            console.log('[PIPELINE_DEBUG] Language Resolution:');
            console.log('[PIPELINE_DEBUG] bCode (resolved partner language):', bCode);
            console.log('[PIPELINE_DEBUG] bShort (partner language short):', bShort);

            const targetShort = detectedShort === aShort ? bShort : aShort;
            const targetForTts = targetShort === aShort ? knownLanguageA : bCode;

            console.log('[PIPELINE_DEBUG] Language detection results:');
            console.log('[PIPELINE_DEBUG] detectedShort:', detectedShort);
            console.log('[PIPELINE_DEBUG] aShort (knownLanguageA):', aShort);
            console.log('[PIPELINE_DEBUG] bShort (other language):', bShort);
            console.log('[PIPELINE_DEBUG] targetShort:', targetShort);

            // Check if source and target are the same - if so, skip translation
            if (detectedShort === targetShort) {
                console.log(`[PIPELINE] Skipping translation - source and target are the same: ${detectedShort}`);
                // Just return the original transcript without translation
                const finalAudioEncoding2 = ttsAudioEncoding || 'MP3';
                const audioBuffer2 = await text_To_Speech(
                    transcript, // Use original transcript instead of translated
                    ttsVoiceName,
                    targetForTts,
                    ttsSsmlGender,
                    finalAudioEncoding2
                );
                const audioContentType2 = getContentTypeForEncoding(finalAudioEncoding2);

                return res.json({
                    success: true,
                    transcript,
                    detectedLanguageCode: sttResult.detectedLanguageCode,
                    translatedText: transcript, // Same as transcript since no translation needed
                    audioContent: (audioBuffer2 || Buffer.alloc(0)).toString('base64'),
                    audioContentType: audioContentType2
                });
            }

            const translatedText2 = await translate_Text(transcript, targetShort, detectedShort);

            // Update cache if we discovered a new B (different from A and previous B)
            if (detectedShort !== aShort && (!freshCached.languageB || toShortLanguageCode(freshCached.languageB) !== detectedShort)) {
                const newB = isoToBcp47Preferred(detectedShort);
                global.__convCache.set(conversationId, {
                    languageBISO: detectedShort,
                    confidenceB: undefined,
                    languageB: newB,
                    lastUpdated: now
                });
                console.log('[PIPELINE_DEBUG] Updated conversation cache with new partner language:', newB);
            }

            const finalAudioEncoding2 = ttsAudioEncoding || 'MP3';
            const audioBuffer2 = await text_To_Speech(
                translatedText2,
                ttsVoiceName,
                targetForTts,
                ttsSsmlGender,
                finalAudioEncoding2
            );
            const audioContentType2 = getContentTypeForEncoding(finalAudioEncoding2);

            return res.json({
                success: true,
                transcript,
                detectedLanguageCode: sttResult.detectedLanguageCode,
                translatedText: translatedText2,
                audioContent: (audioBuffer2 || Buffer.alloc(0)).toString('base64'),
                audioContentType: audioContentType2
            });
        } else {
            const sourceLang = translateSourceLanguage || toShortLanguageCode(sttLanguageCode);
            translatedText = await translate_Text(transcript, translateTargetLanguage, sourceLang);
        }

        // 3) Text-to-Speech (single-direction)
        const finalAudioEncoding = ttsAudioEncoding || 'MP3';
        const audioBuffer = await text_To_Speech(translatedText, ttsVoiceName, ttsLanguageCode, ttsSsmlGender, finalAudioEncoding);
        const audioContentType = getContentTypeForEncoding(finalAudioEncoding);

        return res.json({
            success: true,
            transcript,
            translatedText,
            audioContent: (audioBuffer || Buffer.alloc(0)).toString('base64'),
            audioContentType
        });
    } catch (error) {
        console.error('Error in pipeline (STT -> Translate -> TTS):', error);
        return res.status(500).json({ success: false, message: 'Pipeline error' });
    }
};

module.exports = tts_sttPipeline;