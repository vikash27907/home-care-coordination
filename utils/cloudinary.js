const { cloudinary } = require("../src/cloudinary");

function uploadBufferToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );
    upload.end(file.buffer);
  });
}

module.exports = { uploadBufferToCloudinary };
