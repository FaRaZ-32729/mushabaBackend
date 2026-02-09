let ffmpeg;
let ffmpegStatic;
try {
    ffmpeg = require('fluent-ffmpeg');
    ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
    }
} catch (_) {
    // ffmpeg is optional; if not installed, we skip transcoding
}


function inferSttEncodingFromDataUri(dataUri) {
    if (!dataUri || typeof dataUri !== 'string') return undefined;
    if (!dataUri.startsWith('data:')) return undefined;
    const header = dataUri.split(',')[0] || '';
    if (/audio\/webm/i.test(header)) return 'WEBM_OPUS';
    if (/audio\/ogg/i.test(header)) return 'OGG_OPUS';
    if (/audio\/wav|audio\/x-wav/i.test(header)) return 'LINEAR16';
    if (/audio\/mpeg/i.test(header)) return 'MP3';
    return undefined;
}

// Optional: transcode m4a/mp4/aac to ogg/opus for stable STT
async function maybeTranscodeToOggOpus(dataUri) {
    if (!ffmpeg || !dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) return null;
    const header = dataUri.split(',')[0] || '';
    if (/audio\/(webm|ogg|wav|x-wav|mpeg)/i.test(header)) return null;
    const base64 = dataUri.split(',')[1] || '';
    if (!base64) return null;
    const inputBuffer = Buffer.from(base64, 'base64');
    const path = require('path');
    const fs = require('fs');
    const tmp = require('os').tmpdir();
    const inPath = path.join(tmp, `in_${Date.now()}.bin`);
    const outPath = path.join(tmp, `out_${Date.now()}.ogg`);
    fs.writeFileSync(inPath, inputBuffer);
    await new Promise((resolve, reject) => {
        ffmpeg(inPath)
            .audioCodec('libopus')
            .format('ogg')
            .audioChannels(1)
            .audioFrequency(48000)
            .outputOptions(['-b:a 64k'])
            .on('end', resolve)
            .on('error', reject)
            .save(outPath);
    });
    const outBuffer = fs.readFileSync(outPath);
    try { fs.unlinkSync(inPath); } catch (_) { }
    try { fs.unlinkSync(outPath); } catch (_) { }
    const outBase64 = outBuffer.toString('base64');
    return `data:audio/ogg;base64,${outBase64}`;
}

module.exports = {
    inferSttEncodingFromDataUri,
    maybeTranscodeToOggOpus
}