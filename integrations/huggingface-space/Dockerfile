FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
EXPOSE 7860
CMD ["node", "server.mjs"]
