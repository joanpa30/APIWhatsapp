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

            // 1. Identificador técnico inicial
            let remoteJid = msg.key?.remoteJid || from;

            // 2. Extraer el ID puro y determinar el dominio correcto
            let pureId = remoteJid.split('@')[0];

            // Lógica de LID: Si tiene 15 dígitos, es un LID y debe usar @lid para enviar mensajes
            const isLid = pureId.length >= 15;
            const correctDomain = isLid ? '@lid' : '@s.whatsapp.net';
            const technicalJid = pureId + correctDomain;

            console.log(`🔍 Detectado: ${isLid ? 'LID' : 'Número estándar'} | ID: ${pureId}`);

            // 3. Intentar obtener el número de teléfono REAL (MSISDN) para n8n
            let numeroParaN8N = pureId;
            try {
                // Intentamos buscar en los contactos del proveedor si existe el mapeo al número real
                const contactInfo = await adapterProvider.getInstance().onWhatsApp(technicalJid);
                if (contactInfo && contactInfo[0] && contactInfo[0].jid) {
                    // Si el jid devuelto es distinto, es probable que sea el MSISDN (teléfono real)
                    const mappedNumber = contactInfo[0].jid.split('@')[0];
                    if (mappedNumber !== pureId) {
                        console.log(`📱 Mapeo encontrado: LID ${pureId} -> Teléfono ${mappedNumber}`);
                        numeroParaN8N = mappedNumber;
                    }
                }
            } catch (e) {
                console.log("No se pudo obtener el mapeo del número real, usando ID original.");
            }

            const startTime = Date.now();

            // 4. Enviar los datos a N8N
            const response = await axios.post(N8N_WEBHOOK_URL, {
                jid: technicalJid, // Mandamos el JID corregido (@lid o @s.whatsapp)
                numero: numeroParaN8N, // Mandamos el teléfono real (311...) si lo encontramos
                mensaje: body,
                nombre: pushName || "Desconocido",
                contexto: id,
                mediaUrl: mediaUrl || null,
            });

            const duration = (Date.now() - startTime) / 1000;
            console.log(`✅ N8N respondió en ${duration}s con:`, JSON.stringify(response.data));

            if (Array.isArray(response.data) && response.data.length > 0) {
                const n8nResponse = response.data[0];

                // Priorizamos el JID que traiga n8n, si no, usamos nuestro technicalJid
                let targetJid = n8nResponse.jid || n8nResponse.from || technicalJid;
                const textoRespuesta = n8nResponse.respuesta;

                if (!textoRespuesta) return;

                // Corregimos dominio del JID de salida si n8n mandó solo números
                if (!targetJid.includes('@')) {
                    // Si n8n nos devuelve el ID largo, le ponemos @lid, si es corto @s.whatsapp.net
                    targetJid = targetJid.length >= 15 ? `${targetJid}@lid` : `${targetJid}@s.whatsapp.net`;
                }

                console.log(`📤 Enviando respuesta a: ${targetJid}`);
                await sendDirectMessage(adapterProvider, targetJid, textoRespuesta);
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
