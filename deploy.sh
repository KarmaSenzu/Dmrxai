#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment...${NC}"

cd /home/ubuntu/dmrxai

echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin main

echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}Building application...${NC}"
npm run build

echo -e "${YELLOW}Restarting application with PM2...${NC}"
pm2 restart dmrxai || pm2 start npm --name "dmrxai" -- start

echo -e "${YELLOW}PM2 Status:${NC}"
pm2 status

echo -e "${GREEN}Deployment completed successfully!${NC}"
