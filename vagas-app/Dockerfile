# VagaCerta — imagem de produção. Sem dependências: só o Node.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DADOS=/dados
COPY package.json ./
COPY src ./src
COPY tools/serve.js tools/enviar-alertas.js ./tools/
RUN mkdir -p /dados && chown node:node /dados
USER node
VOLUME ["/dados"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/saude || exit 1
CMD ["node", "tools/serve.js"]
