# EV Connect 2026 - Landing Page

A modern, responsive landing page for the EV Connect 2026 rally in Indore, organized by EV Urjaa and 4K Media Marketing.

## 📅 Event Details

- **Event**: EV Connect 2026 Rally
- **Date**: June 7, 2026
- **Time**: 7:00 AM - 10:00 AM
- **Location**: NRK Business Park, Vijay Nagar, Indore
- **Organizers**: EV Urjaa & 4K Media Marketing

## 🚀 Features

- Modern, responsive design with EV-themed styling
- Real-time countdown timer to event date
- Interactive registration form with validation
- Smooth scrolling navigation
- Mobile-friendly hamburger menu
- Animated elements and transitions
- SEO optimized
- AWS deployment ready

## 🛠️ Tech Stack

- **Backend**: Node.js with Express.js
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Deployment**: AWS (Elastic Beanstalk, ECS, or Amplify)
- **Containerization**: Docker

## 📦 Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd Ev_connect_2026
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

## 🌐 AWS Deployment Options

### Option 1: AWS Elastic Beanstalk (Recommended)

1. **Install AWS CLI** and configure your credentials:
```bash
aws configure
```

2. **Initialize Elastic Beanstalk**:
```bash
eb init
```
- Select region: ap-south-1 (Mumbai)
- Application name: ev-connect-2026
- Platform: Node.js

3. **Create environment**:
```bash
eb create production
```

4. **Deploy**:
```bash
eb deploy
```

5. **Open your application**:
```bash
eb open
```

### Option 2: AWS App Runner

1. **Build and push Docker image to ECR**:
```bash
# Login to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com

# Build image
docker build -t ev-connect-2026 .

# Tag image
docker tag ev-connect-2026:latest <account-id>.dkr.ecr.ap-south-1.amazonaws.com/ev-connect-2026:latest

# Push image
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/ev-connect-2026:latest
```

2. **Create App Runner service** via AWS Console or CLI

### Option 3: AWS Amplify

1. **Install Amplify CLI**:
```bash
npm install -g @aws-amplify/cli
amplify configure
```

2. **Initialize Amplify**:
```bash
amplify init
```

3. **Add hosting**:
```bash
amplify add hosting
```
- Select: Continuous deployment (Git-based deployment)
- Choose your Git provider

4. **Publish**:
```bash
amplify publish
```

### Option 4: Docker Compose (Local Testing)

```bash
docker-compose up --build
```

## 📁 Project Structure

```
Ev_connect_2026/
├── public/
│   ├── css/
│   │   └── styles.css          # Main stylesheet
│   ├── js/
│   │   └── script.js           # Interactive features
│   └── index.html              # Landing page
├── .ebextensions/
│   └── nodecommand.config      # Elastic Beanstalk config
├── server.js                   # Express server
├── package.json                # Dependencies
├── Dockerfile                  # Docker configuration
├── docker-compose.yml          # Docker Compose setup
├── nginx.conf                  # Nginx configuration
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=production
```

### Customization

- **Event Details**: Edit `public/index.html` to update event information
- **Styling**: Modify `public/css/styles.css` for design changes
- **Countdown Date**: Update the date in `public/js/script.js`

## 🔒 Security Features

- Helmet.js for security headers
- Compression middleware for performance
- Static file caching
- Input validation on forms
- CSP (Content Security Policy) ready

## 📊 Performance Optimization

- Gzip compression enabled
- Static file caching (1 day)
- Minified CSS and JS (production)
- Optimized images
- Lazy loading ready

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Kill process on port 3000 (Linux/Mac)
lsof -ti:3000 | xargs kill
```

### Dependencies Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### AWS Deployment Issues
- Check AWS CloudWatch logs for errors
- Verify IAM permissions
- Ensure security groups allow traffic on port 80/443

## 📝 API Endpoints

- `GET /` - Landing page
- `GET /health` - Health check endpoint
- Static files served from `/public`
 - `POST /api/register` - Accepts JSON registration payload and persists it (name, email, phone, vehicle, organization)
 - `GET /` - Landing page
 - `GET /health` - Health check endpoint
 - Static files served from `/public`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - feel free to use this project for your events.

## 📞 Support

For queries about the event:
- Email: contact@evurjaa.com
- Organizers: EV Urjaa & 4K Media Marketing

## 🎯 Future Enhancements

- Backend API for registration data
- Database integration (MongoDB/PostgreSQL)
- Email notifications
- Payment gateway for registration fees
- Admin dashboard
- Social media integration
- Multi-language support

---

Built with ⚡ by EV Urjaa & 4K Media Marketing
