
// ---- Extracted scripts from inline <script> blocks ----
const calendarDays = document.getElementById('calendar-days');
    const monthYear = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const starsContainer = document.getElementById('stars');
    const holidayDescription = document.getElementById('holiday-description');

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();

    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    // Define holidays with date keys and descriptions
    const holidays = {
      // Format: 'YYYY-MM-DD': 'Holiday Description'
      '2024-01-01': 'Tahun Baru Masehi',
      '2024-02-10': 'Hari Raya Imlek',
      '2024-03-11': 'Hari Suci Nyepi',
      '2024-04-10': 'Wafat Isa Almasih',
      '2024-05-01': 'Hari Buruh Internasional',
      '2024-05-09': 'Kenaikan Yesus Kristus',
      '2024-05-23': 'Hari Raya Waisak',
      '2024-06-01': 'Hari Lahir Pancasila',
      '2024-06-17': 'Hari Raya Idul Fitri',
      '2024-08-17': 'Hari Kemerdekaan RI',
      '2024-11-01': 'Hari Raya Idul Adha',
      '2024-12-25': 'Hari Natal'
    };

    function createStars() {
      for (let i = 0; i < 50; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDuration = `${Math.random() * 10 + 5}s`;
        starsContainer.appendChild(star);
      }
    }

    createStars();

    // IndexedDB utility functions
    function openDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('CalendarDB', 1);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('days')) {
            db.createObjectStore('days', { keyPath: 'date' });
          }
        };
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    }

    function getDayState(db, date) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['days'], 'readonly');
        const store = transaction.objectStore('days');
        const request = store.get(date);
        request.onsuccess = () => {
          resolve(request.result ? request.result.state : null);
        };
        request.onerror = () => {
          reject(request.error);
        };
      });
    }

    function putDayState(db, date, state) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['days'], 'readwrite');
        const store = transaction.objectStore('days');
        if (state === null) {
          const deleteRequest = store.delete(date);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        } else {
          const request = store.put({ date, state });
          request.onsuccess = () => {
            resolve();
          };
          request.onerror = () => {
            reject(request.error);
          };
        }
      });
    }

    // Helper to format date as YYYY-MM-DD
    function formatDate(year, month, day) {
      const mm = (month + 1).toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }

    async function renderCalendar(month, year) {
      const db = await openDB();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDay = firstDay.getDay();

      monthYear.textContent = `${months[month]} ${year}`;
      calendarDays.innerHTML = '';

      // Add days from previous month
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for (let i = startingDay - 1; i >= 0; i--) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day', 'other-month');
        const dayNumber = document.createElement('div');
        dayNumber.classList.add('day-number');
        dayNumber.textContent = prevMonthLastDay - i;
        const dayName = document.createElement('div');
        dayName.classList.add('day-name');
        // Calculate day name for previous month day
        const prevMonthDate = new Date(year, month - 1, prevMonthLastDay - i);
        dayName.textContent = days[prevMonthDate.getDay()];
        dayElement.appendChild(dayNumber);
        dayElement.appendChild(dayName);
        calendarDays.appendChild(dayElement);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day');

        const dayNumber = document.createElement('div');
        dayNumber.classList.add('day-number');
        dayNumber.textContent = day;

        const dayName = document.createElement('div');
        dayName.classList.add('day-name');
        const currentDate = new Date(year, month, day);
        dayName.textContent = days[currentDate.getDay()];

        dayElement.appendChild(dayNumber);
        dayElement.appendChild(dayName);

        const dateKey = formatDate(year, month, day);

        // Load saved state from IndexedDB and apply class
        const savedState = await getDayState(db, dateKey);
        let clickCount = 0;
        if (savedState === 'wfh') {
          dayElement.classList.add('wfh');
          clickCount = 1;
        } else if (savedState === 'other') {
          dayElement.classList.add('other');
          clickCount = 2;
        }

        if (currentDate.toDateString() === new Date().toDateString()) {
          dayElement.classList.add('today');
        }

        if (holidays[dateKey]) {
          dayElement.classList.add('holiday');
          dayElement.addEventListener('click', () => {
            holidayDescription.textContent = holidays[dateKey];
          });
        } else if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          dayElement.classList.add('weekend');
        } else {
          dayElement.addEventListener('click', async () => {
            clickCount++;
            if (clickCount === 1) {
              dayElement.classList.remove('other');
              dayElement.classList.add('wfh');
              await putDayState(db, dateKey, 'wfh');
              holidayDescription.textContent = '';
            } else if (clickCount === 2) {
              dayElement.classList.remove('wfh');
              dayElement.classList.add('other');
              await putDayState(db, dateKey, 'other');
              holidayDescription.textContent = '';
            } else {
              dayElement.classList.remove('wfh', 'other');
              clickCount = 0;
              await putDayState(db, dateKey, null);
              holidayDescription.textContent = '';
            }
            // Update total WFO count display live on click
            updateTotalWfoCount();
          });
        }

        calendarDays.appendChild(dayElement);
      }

      const totalCells = startingDay + daysInMonth;
      const remainder = totalCells % 7;
      const emptyCellsNeeded = remainder === 0 ? 0 : 7 - remainder;

      // Add days from next month only if last week is incomplete
      for (let i = 1; i <= emptyCellsNeeded; i++) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day', 'other-month');
        const dayNumber = document.createElement('div');
        dayNumber.classList.add('day-number');
        dayNumber.textContent = i;
        const dayName = document.createElement('div');
        dayName.classList.add('day-name');
        const nextMonthDate = new Date(year, month + 1, i);
        dayName.textContent = days[nextMonthDate.getDay()];
        dayElement.appendChild(dayNumber);
        dayElement.appendChild(dayName);
        calendarDays.appendChild(dayElement);
      }

      // Add total WFO count display below calendar
      let totalCountElement = document.getElementById('total-wfo-count');
      if (!totalCountElement) {
        totalCountElement = document.createElement('div');
        totalCountElement.id = 'total-wfo-count';
        totalCountElement.style.marginTop = '10px';
        totalCountElement.style.fontWeight = 'bold';
        totalCountElement.style.color = '#4caf50';
        calendarDays.parentNode.appendChild(totalCountElement);
      }
      // Update total count text
      const wfoDays = document.querySelectorAll('.day.wfh').length;
      totalCountElement.textContent = `Total WFO Days: ${wfoDays}`;
    }

    // Initialize total WFO count on page load
    function updateTotalWfoCount() {
      const totalCountElement = document.getElementById('total-wfo-count');
      if (!totalCountElement) return;
      const wfoDays = document.querySelectorAll('.day.wfh').length;
      totalCountElement.textContent = `Total WFO Days: ${wfoDays}`;
    }

    prevMonthButton.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar(currentMonth, currentYear);
      holidayDescription.textContent = '';
    });

    nextMonthButton.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar(currentMonth, currentYear);
      holidayDescription.textContent = '';
    });

    renderCalendar(currentMonth, currentYear);
