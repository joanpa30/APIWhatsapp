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
        //let mensaje = body || 'Mensaje multimedia';

        // Validación para mensajes vacíos o de sincronización
        if (!body) {
            console.log(`Mensaje vacío de ${pushName} (${from}). No procesar.`);
            return;
        }

        if (msg?.message?.protocolMessage?.type === "EPHEMERAL_SYNC_RESPONSE") {
            console.log(`Mensaje de sincronización detectado (ID: ${id}), ignorando...`);
            return;
        }

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
            console.log(`⏳ Enviando a N8N: ${body}`);
            const startTime = Date.now();

            const response = await axios.post(N8N_WEBHOOK_URL, {
                jid: from, // Identificador completo (importante para LID)
                numero: from.split('@')[0],
                mensaje: body,
                nombre: pushName || "Desconocido",
                contexto: id,
                mediaUrl: mediaUrl || null,
            });

            const duration = (Date.now() - startTime) / 1000;
            console.log(`✅ N8N respondió en ${duration}s`);

            if (Array.isArray(response.data) && response.data.length > 0) {
                const n8nResponse = response.data[0];

                // REGLA DE ORO: Si n8n no devuelve un JID claro, usamos el 'from' original del mensaje recibido
                // Esto garantiza que si el mensaje vino de un LID, se responda al LID exacto.
                const jidFinal = n8nResponse.jid || from;
                const textoRespuesta = n8nResponse.respuesta;

                if (!textoRespuesta) {
                    console.error("⚠️ n8n no devolvió 'respuesta'.");
                    return;
                }

                console.log(`📤 Intentando entregar mensaje a: ${jidFinal}`);
                await sendDirectMessage(adapterProvider, jidFinal, textoRespuesta);
            } else {
                console.error("❌ Respuesta de N8N no válida (vacía o mal formato).");
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
