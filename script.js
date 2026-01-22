document.addEventListener('DOMContentLoaded', () => {
    // Initial setup
    showScreen('home');
});

const screenTitles = {
    'home': 'Visão Geral',
    'schedule': 'Agenda Inteligente',
    'products': 'Gestão de Produtos',
    'contact': 'Central de Mensagens',
    'settings': 'Configurações do Sistema'
};

function showScreen(screenId) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.add('hidden');
    });

    // Show the selected screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    }

    // Update active state in menu
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${screenId}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update Header Title
    const titleElement = document.querySelector('.header-left h2');
    if (titleElement && screenTitles[screenId]) {
        titleElement.textContent = screenTitles[screenId];
    }
}
