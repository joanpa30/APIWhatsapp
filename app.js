const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const express = require('express');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3030;
const N8N_WEBHOOK_URL = 'https://n8n.jandatix.com:5678/webhook/whatsappAgent';
const adapterDB = new MockAdapter();
const adapterProvider = createProvider(BaileysProvider);
const adapterFlow = createFlow([]);

const sendDirectMessage = async (provider, jid, message) => {
    try {
        await provider.sendText(jid, message, { options: {} });
        console.log(`Mensaje enviado a ${jid}: ${message}`);
    } catch (error) {
        console.error(`Error al enviar mensaje a ${jid}:`, error);
    }
};

const saveAudio = async (stream, filePath) => {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        stream.pipe(fileStream);
        fileStream.on('finish', () => resolve(filePath));
        fileStream.on('error', (err) => reject(err));
    });
};

const main = async () => {
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    QRPortalWeb();

    adapterProvider.on('message', async (msg) => {
        console.log(`Nuevo mensaje recibido:`, JSON.stringify(msg, null, 2));

        const { from, pushName, body } = msg;
        const id = msg.key?.id || "ID_NO_DISPONIBLE";
        let mensaje = body || 'Mensaje multimedia';

        try {
            let mediaUrl = null;
            let filePath = null;

            // Verificar si el mensaje contiene un audio
            if (msg.message?.audioMessage) {
                console.log("Mensaje de audio recibido");

                const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
                const fileName = `audio_${id}.ogg`;
                filePath = path.join(__dirname, fileName);

                await saveAudio(stream, filePath);
                mediaUrl = `http://149.50.143.17:${PORT}/audios/${fileName}`;
                mensaje = `Mensaje de audio recibido: ${mediaUrl}`;
            }

            // Enviar los datos a N8N
            const response = await axios.post(N8N_WEBHOOK_URL, {
                numero: from.replace('@s.whatsapp.net', ''),
                mensaje: mensaje,
                nombre: pushName || "Desconocido",
                contexto: id,
                mediaUrl: mediaUrl || null,
            });

            console.log("Respuesta completa de N8N:", response.data);

            if (Array.isArray(response.data) && response.data.length > 0) {
                let keys = Object.keys(response.data[0]);
                let fromKey = keys[0];
                let respuestaKey = keys[1];

                let from = response.data[0][fromKey];
                let respuesta = response.data[0][respuestaKey];

                if (!from.includes("@s.whatsapp.net")) {
                    from = from + "@s.whatsapp.net";
                }

                await sendDirectMessage(adapterProvider, from, respuesta);
            } else {
                console.error("La respuesta de N8N no es válida:", response.data);
            }
        } catch (error) {
            console.error("Error al manejar el mensaje:", error);
        }
    });

    // Servidor para acceder a los audios
    app.use('/audios', express.static(path.join(__dirname)));

    // Endpoint para enviar mensajes directos desde un webhook
    app.get('/send-message', async (req, res) => {
        const { number, message } = req.query;

        if (!number || !message) {
            return res.status(400).send('Faltan parámetros "number" o "message".');
        }

        const jid = `${number}@s.whatsapp.net`;

        try {
            await sendDirectMessage(adapterProvider, jid, message);
            res.status(200).send(`Mensaje enviado a ${number}`);
        } catch (error) {
            res.status(500).send(`Error enviando mensaje: ${error.message}`);
        }
    });
};

main();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

