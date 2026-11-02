
export function createChatView(container, onSend) {
  const panel = document.createElement('section');
  panel.className = 'chat-panel';

  const header = document.createElement('h2');
  header.textContent = 'Чат кімнати';

  const status = document.createElement('p');
  status.className = 'chat-status';
  status.textContent = 'Підключення...';

  const messages = document.createElement('div');
  messages.className = 'chat-messages';
  messages.setAttribute('aria-live', 'polite');

  const form = document.createElement('form');
  form.className = 'chat-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Напиши повідомлення...';
  input.maxLength = 500;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Повідомлення чату');

  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Надіслати';

  form.append(input, button);
  panel.append(header, status, messages, form);
  container.append(panel);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = input.value.trim();

    if (!text) return;

    onSend(text);
    input.value = '';
    input.focus();
  });

  return {
    addMessage({ name, text, time }) {
      const message = document.createElement('div');
      message.className = 'chat-message';

      const author = document.createElement('strong');
      author.textContent = name;

      const content = document.createElement('p');
      content.textContent = text;

      const timestamp = document.createElement('small');
      timestamp.textContent = time
        ? new Date(time).toLocaleTimeString()
        : '';

      message.append(author, content, timestamp);
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;
    },

    setStatus(text) {
      status.textContent = text;
    },

    clear() {
      messages.replaceChildren();
    },
  };
}
