# SMS Aggregation Network

A full-stack platform connecting SMS providers (FiveSim, HeroSMS) to a distributed
network of agent-operated GSM modem pools.

## Architecture

| Component     | Tech              | Purpose                          |
|---------------|-------------------|----------------------------------|
| Master Server | Node.js/Express   | API, routing, AI SIM selection   |
| Database      | PostgreSQL 15     | Agents, orders, SIMs, payouts    |
| Cache         | Redis 7           | Sessions, rate limiting          |
| Admin Panel   | Static HTML       | Withdrawal & order management    |
| Agent App     | React Native/Expo | Mobile dashboard for agents      |
| Device Agent  | Python            | Runs on modem host, streams SMS  |
| Proxy         | Nginx             | Routing, SSL, rate limiting      |

## Quick Start

1. Clone and edit `.env` (all passwords + API keys)
2. Run `./setup.sh` (Linux/Mac) or `setup.bat` (Windows)
3. Open `http://localhost:8080` for the admin panel

## Project Structure
