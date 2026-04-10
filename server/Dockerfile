# Use Debian-based Node image — has OpenSSL built in
FROM node:20-slim

# Install OpenSSL — required by Prisma
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "run", "start:prod"]