// Bestie App Template - JavaScript

document.addEventListener('DOMContentLoaded', function() {
    
    // Initialize GSAP Animations
    initAnimations();
    
    // Initialize Demo Chat
    initDemoChat();
    
    // Smooth Scroll for Navigation
    initSmoothScroll();
    
});

// GSAP Animations
function initAnimations() {
    // Hero elements animation
    gsap.from('nav', {
        duration: 0.8,
        y: -20,
        opacity: 0,
        ease: 'power2.out'
    });
    
    gsap.from('h1', {
        duration: 1,
        y: 30,
        opacity: 0,
        ease: 'power2.out',
        delay: 0.2
    });
    
    gsap.from('.hero-stats', {
        duration: 0.8,
        y: 20,
        opacity: 0,
        ease: 'power2.out',
        delay: 0.6
    });
    
    // Feature cards stagger animation
    gsap.from('.feature-card', {
        duration: 0.6,
        y: 30,
        opacity: 0,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: '#features',
            start: 'top 80%'
        }
    });
}

// Demo Chat Functionality
function initDemoChat() {
    const chatContainer = document.getElementById('demoChat');
    const input = document.getElementById('demoInput');
    const sendBtn = document.getElementById('demoSend');
    
    if (!chatContainer) return;
    
    // Initial greeting
    addMessage('bestie', "Hey! 👋 I'm Bestie, your AI relationship coach. What would you like help with today?");
    
    // Send button click
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter key press
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    function sendMessage() {
        const message = input.value.trim();
        if (!message) return;
        
        // Add user message
        addMessage('user', message);
        input.value = '';
        
        // Simulate Bestie response
        setTimeout(() => {
            const responses = [
                "That's a great question! In relationships, communication is key. Try starting with something simple like expressing how you feel using 'I' statements.",
                "I totally understand that! One tip: remember that everyone shows love differently. Maybe take our love language quiz together? 💕",
                "Great topic! Setting boundaries is important. Start by being clear about what you need, and remember - it's okay to say no!",
                "That's so sweet! 💖 For date ideas, try something low-pressure like a picnic in the park or cooking together at home."
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            addMessage('bestie', randomResponse);
        }, 1000);
    }
    
    function addMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message mb-3';
        
        if (type === 'user') {
            messageDiv.innerHTML = `<div class="chat-user">${text}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="chat-bestie">${text}</div>`;
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Pre-defined demo scenarios
window.demoChat = function(scenario) {
    const chatContainer = document.getElementById('demoChat');
    const input = document.getElementById('demoInput');
    
    if (!chatContainer || !input) return;
    
    let message, response;
    
    switch(scenario) {
        case 'help':
            message = "I need help with conversations";
            response = "Of course! What kind of conversation are you preparing for? I can help with dating conversations, conflict resolution, or just everyday chats with your partner.";
            break;
        case 'date':
            message = "Give me some date ideas";
            response = "🎉 Here are some fun date ideas: 1) DIY pizza night at home, 2) Sunrise picnic, 3) Local museum adventure, 4) Cooking class together, 5) Stargazing with hot cocoa!";
            break;
        case 'boundary':
            message = "How do I set boundaries?";
            response = "🚧 Great question! Start by: 1) Identifying what you need, 2) Being specific about your boundaries, 3) Communicating calmly but firmly, 4) Being consistent. Remember, boundaries protect your wellbeing!";
            break;
        case 'love':
            message = "What's my love language?";
            response = "❤️ To find your love language, think about how you most like to receive love. Take our quiz in the app or website! The 5 languages are: Words of Affirmation, Quality Time, Gifts, Acts of Service, and Physical Touch.";
            break;
    }
    
    // Add user message
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-message mb-3';
    userDiv.innerHTML = `<div class="chat-user">${message}</div>`;
    chatContainer.appendChild(userDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Add Bestie response after delay
    setTimeout(() => {
        const bestieDiv = document.createElement('div');
        bestieDiv.className = 'chat-message mb-3';
        bestieDiv.innerHTML = `<div class="chat-bestie">${response}</div>`;
        chatContainer.appendChild(bestieDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 800);
};

// Smooth Scroll
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Navbar background on scroll
window.addEventListener('scroll', function() {
    const nav = document.querySelector('nav');
    if (window.scrollY > 50) {
        nav.classList.add('bg-black/80', 'backdrop-blur-lg');
    } else {
        nav.classList.remove('bg-black/80', 'backdrop-blur-lg');
    }
});