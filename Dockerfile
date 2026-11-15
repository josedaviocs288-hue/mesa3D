FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY public ./public
COPY server.js platform.js glb.js ./
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 MESA3D_DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.js"]
