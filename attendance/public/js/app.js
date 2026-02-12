// Get query params
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Toggle password visibility
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.toggle-password').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const targetId = toggle.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        toggle.textContent = '🙈';
      } else {
        input.type = 'password';
        toggle.textContent = '👁️';
      }
    });
  });
});

// Register
if (document.getElementById('register-form')) {
  const type = getQueryParam('type');
  document.getElementById('register-title').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Register`;
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, type })
    });
    const result = await response.text();
    if (response.ok) {
      window.location.href = `login.html?type=${type}`;
    } else {
      alert(result);
    }
  });
}

// Login
if (document.getElementById('login-form')) {
  const type = getQueryParam('type');
  document.getElementById('login-title').textContent = type ? `${type.charAt(0).toUpperCase() + type.slice(1)} Login` : 'Login';
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.token);
      window.location.href = data.dashboard;
    } else {
      alert('Login failed');
    }
  });
}

// Student Dashboard
if (window.location.pathname.includes('student-dashboard.html')) {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = 'index.html';

  // Load timetable
  loadTimetable();

  // Add timetable wizard
  document.getElementById('add-timetable-btn').addEventListener('click', () => addTimetableWizard(false));

  // Load daily timetable
  document.getElementById('load-timetable').addEventListener('click', async () => {
    const date = document.getElementById('attendance-date').value;
    const response = await fetch(`/timetable/${date}`, {
      headers: { 'Authorization': token }
    });
    const periods = await response.json();
    const container = document.getElementById('daily-timetable');
    container.innerHTML = '';
    periods.forEach(period => {
      const btn = document.createElement('button');
      btn.className = 'btn period-btn';
      btn.textContent = `${period.subject} (${period.start_time} - ${period.end_time})`;
      btn.addEventListener('click', () => markAttendance(period.subject, date));
      container.appendChild(btn);
    });
  });

  async function loadTimetable() {
    const response = await fetch('/timetable', {
      headers: { 'Authorization': token }
    });
    const periods = await response.json();
    const container = document.getElementById('timetable-list');
    container.innerHTML = '';
    const grouped = periods.reduce((acc, period) => {
      if (!acc[period.day]) acc[period.day] = [];
      acc[period.day].push(period);
      return acc;
    }, {});
    for (const day in grouped) {
      const h3 = document.createElement('h3');
      h3.textContent = day.charAt(0).toUpperCase() + day.slice(1);
      container.appendChild(h3);
      grouped[day].forEach(period => {
        const div = document.createElement('div');
        div.textContent = `${period.subject}${period.section ? ` (${period.section})` : ''}: ${period.start_time} - ${period.end_time}`;
        const editBtn = document.createElement('button');
        editBtn.className = 'btn edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => editPeriod(period));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deletePeriod(period.id));
        div.appendChild(editBtn);
        div.appendChild(deleteBtn);
        container.appendChild(div);
      });
    }
  }

  async function editPeriod(period) {
    const start_time = prompt('Start Time:', period.start_time);
    const end_time = prompt('End Time:', period.end_time);
    const subject = prompt('Subject:', period.subject);
    let section = period.section;
    if (window.location.pathname.includes('teacher')) {
      section = prompt('Section:', period.section);
    }
    if (start_time && end_time && subject) {
      await fetch(`/timetable/${period.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ start_time, end_time, subject, section })
      });
      loadTimetable();
    }
  }

  async function deletePeriod(id) {
    if (confirm('Delete this period?')) {
      await fetch(`/timetable/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
      });
      loadTimetable();
    }
  }

  async function addTimetableWizard(isTeacher) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      let addPeriod = true;
      while (addPeriod) {
        const start_time = prompt(`Enter start time for ${day} (HH:MM):`);
        const end_time = prompt(`Enter end time for ${day} (HH:MM):`);
        const subject = prompt(`Enter subject for ${day}:`);
        let section = null;
        if (isTeacher) {
          section = prompt(`Enter section for ${day}:`);
        }
        await fetch('/add-timetable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ day, start_time, end_time, subject, section })
        });
        addPeriod = confirm('Add another period for this day?');
      }
      if (i < days.length - 1) {
        const nextDay = confirm('Add timetable for next day?');
        if (!nextDay) break;
      }
    }
    loadTimetable();
  }

  async function markAttendance(subject, date) {
    const roll_number = prompt('Enter Roll Number:');
    const otp = prompt('Enter OTP:');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const response = await fetch('/mark-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ roll_number, otp, lat, lng, subject, date })
        });
        alert(await response.text());
      }, (error) => {
        alert('Location access denied. Please allow location access to mark attendance.');
      });
    } else {
      alert('Geolocation not supported');
    }
  }

  document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
  });
}

// Teacher Dashboard
if (window.location.pathname.includes('teacher-dashboard.html')) {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = 'index.html';

  // Load timetable
  loadTimetable();

  // Add timetable wizard
  document.getElementById('add-timetable-btn').addEventListener('click', () => addTimetableWizard(true));

  // View attendance
  document.getElementById('view-attendance-btn').addEventListener('click', async () => {
    const date = document.getElementById('view-date').value;
    if (!date) return alert('Please select a date');
    const response = await fetch(`/attendance/${date}`, {
      headers: { 'Authorization': token }
    });
    const rolls = await response.json();
    const details = document.getElementById('attendance-details');
    details.innerHTML = `<h3>Attendance for ${date}</h3><p>Present Roll Numbers: ${rolls.join(', ') || 'None'}</p>`;
  });

  // Load daily timetable for OTP
  document.getElementById('load-timetable-otp').addEventListener('click', async () => {
    const date = document.getElementById('otp-date').value;
    const response = await fetch(`/timetable/${date}`, {
      headers: { 'Authorization': token }
    });
    const periods = await response.json();
    const container = document.getElementById('daily-timetable-otp');
    container.innerHTML = '';
    periods.forEach(period => {
      const btn = document.createElement('button');
      btn.className = 'btn period-btn';
      btn.textContent = `${period.subject} (${period.start_time} - ${period.end_time})`;
      btn.addEventListener('click', () => generateOTP(period.subject, period.section, date));
      container.appendChild(btn);
    });
  });

  async function loadTimetable() {
    const response = await fetch('/timetable', {
      headers: { 'Authorization': token }
    });
    const periods = await response.json();
    const container = document.getElementById('timetable-list');
    container.innerHTML = '';
    const grouped = periods.reduce((acc, period) => {
      if (!acc[period.day]) acc[period.day] = [];
      acc[period.day].push(period);
      return acc;
    }, {});
    for (const day in grouped) {
      const h3 = document.createElement('h3');
      h3.textContent = day.charAt(0).toUpperCase() + day.slice(1);
      container.appendChild(h3);
      grouped[day].forEach(period => {
        const div = document.createElement('div');
        div.textContent = `${period.subject}${period.section ? ` (${period.section})` : ''}: ${period.start_time} - ${period.end_time}`;
        const editBtn = document.createElement('button');
        editBtn.className = 'btn edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => editPeriod(period));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deletePeriod(period.id));
        div.appendChild(editBtn);
        div.appendChild(deleteBtn);
        container.appendChild(div);
      });
    }
  }

  async function editPeriod(period) {
    const start_time = prompt('Start Time:', period.start_time);
    const end_time = prompt('End Time:', period.end_time);
    const subject = prompt('Subject:', period.subject);
    let section = period.section;
    if (window.location.pathname.includes('teacher')) {
      section = prompt('Section:', period.section);
    }
    if (start_time && end_time && subject) {
      await fetch(`/timetable/${period.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ start_time, end_time, subject, section })
      });
      loadTimetable();
    }
  }

  async function deletePeriod(id) {
    if (confirm('Delete this period?')) {
      await fetch(`/timetable/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
      });
      loadTimetable();
    }
  }

  async function addTimetableWizard(isTeacher) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      let addPeriod = true;
      while (addPeriod) {
        const start_time = prompt(`Enter start time for ${day} (HH:MM):`);
        const end_time = prompt(`Enter end time for ${day} (HH:MM):`);
        const subject = prompt(`Enter subject for ${day}:`);
        let section = null;
        if (isTeacher) {
          section = prompt(`Enter section for ${day}:`);
        }
        await fetch('/add-timetable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ day, start_time, end_time, subject, section })
        });
        addPeriod = confirm('Add another period for this day?');
      }
      if (i < days.length - 1) {
        const nextDay = confirm('Add timetable for next day?');
        if (!nextDay) break;
      }
    }
    loadTimetable();
  }

  async function generateOTP(subject, section, date) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const response = await fetch('/generate-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ subject, section, date, lat, lng })
        });
        const data = await response.json();
        startOTPTimer(data.otp, subject, section);
      }, (error) => {
        alert('Location access denied. Please allow location access to generate OTP.');
      });
    } else {
      alert('Geolocation not supported');
    }
  }

  function startOTPTimer(otp, subject, section) {
    const display = document.getElementById('otp-display');
    let timeLeft = 60; // 2 minutes
    display.innerHTML = `OTP for ${subject} (${section}): ${otp} - Expires in <span id="timer">${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}</span>`;
    const timerElement = document.getElementById('timer');
    const interval = setInterval(() => {
      timeLeft--;
      timerElement.textContent = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
      if (timeLeft <= 0) {
        clearInterval(interval);
        display.innerHTML = 'OTP expired';
      }
    }, 1000);
  }


  document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
  });
}