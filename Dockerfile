# Usa una imagen base de Node.js
FROM node:18-bullseye as bot
# Establece el directorio de trabajo
WORKDIR /app
# Copia los archivos del proyecto al contenedor
COPY package*.json ./
# Instala las dependencias
RUN npm i
# Copia los archivos del proyecto al contenedor
COPY . .
ARG RAILWAY_STATIC_URL
ARG PUBLIC_URL
ARG PORT
# Expone los puertos necesarios
EXPOSE 3000 3030
# Comando para ejecutar la aplicación
CMD ["npm", "start"]
