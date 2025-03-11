const { createBot, createProvider, createFlow } = require('@bot-whatsapp/bot');
const express = require('express');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const axios = require('axios');
const { readFileSync } = require('fs');
const { writeFile } = require('fs/promises');

const app = express();
const PORT = 3030;
const N8N_WEBHOOK_URL = 'http://149.50.143.17:5678/webhook/whatsappAgent'; // webhook en N8N
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

const handleVoiceMessage = async (msg) => {
    try {
        const audio = msg.message?.audioMessage;
        if (!audio) return null;

        const stream = await adapterProvider.downloadMediaMessage(msg);
        const audioPath = `./audio_${Date.now()}.ogg`;
        await writeFile(audioPath, stream);

        return audioPath;
    } catch (error) {
        console.error('Error al manejar mensaje de voz:', error);
        return null;
    }
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
        const id = msg.key?.id || 'ID_NO_DISPONIBLE';
        const audioPath = await handleVoiceMessage(msg);

        try {
            const response = await axios.post(N8N_WEBHOOK_URL, {
                numero: from.replace('@s.whatsapp.net', ''),
                mensaje: body || 'Mensaje de voz',
                nombre: pushName || 'Desconocido',
                contexto: id,
                audioPath: audioPath || null,
            });

            console.log('Respuesta completa de N8N:', response.data);

            if (Array.isArray(response.data) && response.data.length > 0) {
                const from = response.data[0].from + '@s.whatsapp.net';
                const respuesta = response.data[0].respuesta;
                await sendDirectMessage(adapterProvider, from, respuesta);
            }
        } catch (error) {
            console.error('Error enviando a N8N:', error);
        }
    });

    app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
};

main();
