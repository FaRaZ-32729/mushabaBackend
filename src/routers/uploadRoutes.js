const express = require('express');
const router = express.Router();
const {
    uploadFile,
    deleteFile,
    assembleChunks,
    uploadChunks
} = require('../controllers/uploadController');
const { protect } = require('../middleweres/protect');
const uploadImage = require('../utils/uploadImage');

router.use(protect);

// Upload single file
router.post('/', uploadImage.single('file'), uploadFile);

// Delete file
router.delete('/:filename', deleteFile);

// Upload chunk
router.post('/chunk', uploadImage.single('chunk'), uploadChunks);

// Assemble chunks
router.post('/assemble', assembleChunks);

module.exports = router;
