const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const express = require('express');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const axios = require('axios');
const { aesDecrypt } = require('@whiskeysockets/baileys');

const app = express();
const PORT = 3030;
const N8N_WEBHOOK_URL = 'http://149.50.143.17:5678/webhook-test/whatsappAgent'; //webhook en N8N
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

const main = async () => {
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    QRPortalWeb();

    adapterProvider.on('message', async (msg) => {
        const { from, body, pushName, id } = msg;
        console.log(`Nuevo mensaje de ${pushName} (${from}): ${body}`);

        try {
            const response = await axios.post(N8N_WEBHOOK_URL, {
                numero: from.replace('@s.whatsapp.net', ''),
                mensaje: body,
                nombre: pushName,
                contexto: id,
            });

            if (response.data && response.data.respuesta) {
                await sendDirectMessage(adapterProvider, from, response.data.respuesta);
            }else{
                console.error("Respuesta de N8N", response.data);
            }
            
        } catch (error) {
            console.error('Error al enviar datos a N8N:', error);
        }
    });

    //Crea un objeto para enviar un mensaje directo desde un weebhook
    app.get('/send-message', async (req, res) => {
        const { number, message } = req.query;

        if (!number || !message) {
            return res.status(400).send('Faltan parámetros "number" o "message".');
        }

        const jid = `${number}@s.whatsapp.net`; // Formato de WhatsApp

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
