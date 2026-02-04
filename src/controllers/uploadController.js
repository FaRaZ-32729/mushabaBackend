const path = require('path');
const fs = require('fs');

// Upload file
const uploadFile = async (req, res) => {
    try {
        console.log('Upload endpoint hit - req.file:', req.file);
        console.log('Upload endpoint hit - req.body:', req.body);
        console.log('Upload endpoint hit - req.headers:', req.headers);

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        console.log('File uploaded successfully:', fileUrl);

        res.json({
            success: true,
            fileUrl,
            fileName: req.file.filename,
            fileType: req.file.mimetype,
            fileSize: req.file.size
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading file'
        });
    }
};

// Delete file
const deleteFile = async (req, res) => {
    try {
        const filePath = path.join(__dirname, '../uploads', req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting file'
        });
    }
};

// Chunked upload endpoint
const uploadChunks = async (req, res) => {
    try {
        const { fileId, chunkIndex, totalChunks } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No chunk uploaded'
            });
        }

        if (!fileId || chunkIndex === undefined || !totalChunks) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: fileId, chunkIndex, totalChunks'
            });
        }

        // Create chunks directory for this file
        const chunksDir = path.join(__dirname, '../uploads/chunks', fileId);
        if (!fs.existsSync(chunksDir)) {
            fs.mkdirSync(chunksDir, { recursive: true });
        }

        // Save chunk with index
        const chunkPath = path.join(chunksDir, `chunk_${chunkIndex}`);
        fs.renameSync(req.file.path, chunkPath);

        console.log(`Chunk ${chunkIndex}/${totalChunks} uploaded for file ${fileId}`);

        res.json({
            success: true,
            message: 'Chunk uploaded successfully',
            chunkIndex: parseInt(chunkIndex),
            totalChunks: parseInt(totalChunks)
        });
    } catch (error) {
        console.error('Error uploading chunk:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading chunk'
        });
    }
};

// Assemble chunks into final file
const assembleChunks = async (req, res) => {
    try {
        const { fileId, mediaType, totalChunks } = req.body;

        if (!fileId || !mediaType || !totalChunks) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: fileId, mediaType, totalChunks'
            });
        }

        const chunksDir = path.join(__dirname, '../uploads/chunks', fileId);

        // Check if all chunks exist
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunksDir, `chunk_${i}`);
            if (!fs.existsSync(chunkPath)) {
                return res.status(400).json({
                    success: false,
                    message: `Missing chunk ${i}`
                });
            }
        }

        // Create final file
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = mediaType === 'video' ? '.mp4' : '.jpg';
        const finalFileName = `${mediaType}-${uniqueSuffix}${fileExtension}`;
        const finalFilePath = path.join(__dirname, '../uploads', finalFileName);

        // Write chunks to final file
        const writeStream = fs.createWriteStream(finalFilePath);

        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunksDir, `chunk_${i}`);
            const chunkData = fs.readFileSync(chunkPath);
            writeStream.write(chunkData);
        }

        writeStream.end();

        // Wait for write to complete
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Clean up chunks
        fs.rmSync(chunksDir, { recursive: true, force: true });

        const fileUrl = `/uploads/${finalFileName}`;
        console.log(`File assembled successfully: ${fileUrl}`);

        res.json({
            success: true,
            fileUrl,
            fileName: finalFileName,
            fileType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
        });
    } catch (error) {
        console.error('Error assembling file:', error);
        res.status(500).json({
            success: false,
            message: 'Error assembling file'
        });
    }
};

module.exports = {
    uploadFile,
    deleteFile,
    uploadChunks,
    assembleChunks
}