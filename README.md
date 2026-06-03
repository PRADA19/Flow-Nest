# Flow Nest (SmartTodo)

A modern, AI-powered task management application with gamification features.

## 🚀 Quick Start

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm start
```

### Frontend Setup

```bash
cd frontend
# Serve with any static file server (e.g., Live Server in VS Code)
# Or deploy to Vercel
```

## 📋 Features

- **Task Management**: Create, complete, and organize tasks with priorities and tags
- **Calendar View**: Visualize tasks on a calendar
- **Analytics**: Track productivity with detailed analytics
- **AI Assistant**: Get intelligent task suggestions and help
- **Gamification**: Earn XP, level up, and unlock badges
- **Dark Mode**: Beautiful dark/light theme support
- **Responsive Design**: Works on all devices

## 🔧 Configuration

### Backend Environment Variables

Required:
- `PORT` - Server port (default: 5003)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret (generate strong random string)
- `COOKIE_SECRET` - Cookie signing secret (generate strong random string)

Optional:
- `CLIENT_URL` - Frontend URL for CORS
- `ALLOWED_ORIGINS` - Allowed CORS origins
- `OPENAI_API_KEY` - OpenAI API key for AI features

### Frontend Configuration

The frontend automatically detects the API URL:
- Local development: `http://localhost:5003/api`
- Production: Uses `/api` proxy (configure in vercel.json)

## 🚢 Deployment

### Backend (Render)

1. Push code to GitHub
2. Connect repository to Render
3. Configure environment variables
4. Deploy

### Frontend (Vercel)

1. Copy `vercel.json.example` to `vercel.json`
2. Update the backend URL in `vercel.json`
3. Push to GitHub
4. Connect repository to Vercel
5. Deploy

## 📚 Documentation

- [Backend README](backend/README.md)
- [Security Audit Report](SECURITY_AUDIT_REPORT.md)

## 🛡️ Security

- JWT authentication
- Password hashing with bcrypt
- Rate limiting
- Input validation
- CORS protection
- Security headers
- Content Security Policy

## 📝 License

MIT
