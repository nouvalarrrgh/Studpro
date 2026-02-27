// Konfigurasi Tema Warna Tailwind (Sistem App)
tailwind.config = {
    theme: {
        extend: {
            fontFamily: { sans: ['Lexend Deca', 'sans-serif'] },
            colors: {
                primary: '#165DFF', 'primary-hover': '#0E4BD9',
                foreground: '#080C1A', secondary: '#6A7686',
                muted: '#F4F6F8', border: '#E5E7EB',
                success: '#30B22D', 'success-light': '#DCFCE7', 'success-dark': '#166534',
                error: '#ED6B60', 'error-light': '#FEE2E2', 'error-dark': '#991B1B',
                warning: '#FED71F', 'warning-light': '#FEF9C3', 'warning-dark': '#854D0E',
                info: '#00B2FF', 'info-light': '#E0F7FF', 'info-dark': '#00618A',
                // Warna Khusus Me+ Style
                'me-morning': '#FF9F43', 'me-afternoon': '#54A0FF', 'me-evening': '#5F27CD'
            }
        }
    }
}

// Konfigurasi AI Mind Map (Mermaid.js)
mermaid.initialize({ 
    startOnLoad: false, 
    theme: 'default', 
    flowchart: { useMaxWidth: false }, 
    themeVariables: { fontSize: '20px', fontFamily: 'Lexend Deca' } 
});