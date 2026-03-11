const QRCode = require("qrcode");

async function generateQR(url) {
  return QRCode.toDataURL(url, {
    width: 300,
    margin: 2
  });
}

module.exports = generateQR;
