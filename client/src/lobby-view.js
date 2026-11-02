export function renderLobby(container, rooms, onJoin, onRefresh) {
  container.replaceChildren();
  container.className = 'lobby';

  const title = document.createElement('h1');
  title.textContent = 'SpaceFight';

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Введи ім’я та вибери арену';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Ім’я гравця';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Наприклад, Pilot';
  nameInput.maxLength = 20;
  nameInput.value = 'Pilot';
  nameLabel.append(nameInput);

  const roomLabel = document.createElement('label');
  roomLabel.textContent = 'Арена';

  const roomSelect = document.createElement('select');

  function updateRooms(nextRooms) {
    const previousValue = roomSelect.value;
    roomSelect.replaceChildren();

    for (const room of nextRooms) {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent =
        `${room.name} — ${room.asteroidCount} астероїдів (${room.difficulty})`;
      roomSelect.append(option);
    }

    if (nextRooms.some((room) => room.id === previousValue)) {
      roomSelect.value = previousValue;
    }
  }

  updateRooms(rooms);
  roomLabel.append(roomSelect);

  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Завантаження кімнат завершено';

  const joinButton = document.createElement('button');
  joinButton.textContent = 'Увійти в гру';
  joinButton.addEventListener('click', () => {
    const name = nameInput.value.trim();

    if (!name) {
      nameInput.focus();
      status.textContent = 'Введи ім’я гравця.';
      return;
    }

    if (!roomSelect.value) {
      status.textContent = 'Немає доступних арен. Спробуй оновити список.';
      return;
    }

    onJoin({ name, roomId: roomSelect.value });
  });

  const refreshButton = document.createElement('button');
  refreshButton.textContent = 'Оновити кімнати';
  refreshButton.className = 'secondary';
  refreshButton.addEventListener('click', onRefresh);

  container.append(
    title,
    subtitle,
    nameLabel,
    roomLabel,
    joinButton,
    refreshButton,
    status,
  );

  return {
    updateRooms,
    setStatus(message) {
      status.textContent = message;
    },
  };
}
