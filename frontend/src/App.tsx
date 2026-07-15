import { FormEvent, MouseEvent, SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const ASSET_URL = API_URL.startsWith('http') ? API_URL.replace(/\/api$/, '') : '';
const SESSION_KEY = 'asistencia.session';

const BOLIVIA_DEPARTMENTS = [
  'La Paz',
  'Santa Cruz',
  'Cochabamba',
  'Oruro',
  'Potosí',
  'Tarija',
  'Chuquisaca',
  'Beni',
  'Pando',
];

type Role = 'ADMIN' | 'EMPLOYEE';
type AttendanceType = 'ENTRY' | 'EXIT';
type ViewKey = 'today' | 'history' | 'overview' | 'employees' | 'settings' | 'reports';

interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface SessionUser {
  id: string;
  ci: string;
  fullName: string;
  position: string;
  department: string | null;
  departamentoBolivia?: string | null;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  token: string;
}

interface Employee extends Omit<SessionUser, 'token'> {
  phone?: string | null;
  profilePhotoUrl?: string | null;
  locationControlEnabled?: boolean;
  locationRadiusMeters?: number;
  locationPoints?: LocationPoint[];
}

interface Attendance {
  id: string;
  employeeId: string;
  attendanceDate: string;
  configuration?: {
    entryTime: string;
    toleranceMinutes: number;
  };
  entryTime: string | null;
  exitTime: string | null;
  lateMinutes: number;
  status: string;
  entryLocation?: GeoPoint;
  exitLocation?: GeoPoint;
  entryPhotoDataUrl?: string | null;
  exitPhotoDataUrl?: string | null;
  notes?: string | null;
  entryObservation?: string | null;
  exitObservation?: string | null;
  justificationNote?: string | null;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  description?: string | null;
  departments?: string[];
}

interface Configuration {
  name: string;
  entryTime: string;
  exitTime: string;
  toleranceMinutes: number;
}

interface AttendanceSummary {
  date: string;
  activeEmployees: number;
  registered: number;
  present: number;
  late: number;
  outsideArea?: number;
  pending: number;
}

interface AuditLog {
  id: string;
  action: string;
  actor: { ci: string; name: string; role: Role } | null;
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  createdAt: string;
}

interface ApiList<T> {
  data: T[];
  total: number;
}

interface ApiItem<T> {
  data: T;
}

function formatTime(value: string | null) {
  if (!value) return 'Pendiente';
  try {
    if (/^\d{2}:\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function formatAuditDate(value: string | null) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-BO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function formatFullDate(date: Date) {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    PRESENT: 'Presente',
    LATE: 'Con retraso',
    ABSENT: 'Ausente',
    JUSTIFIED: 'Justificado',
    HOLIDAY: 'Feriado',
    WEEKEND: 'Fin de semana',
  };

  return labels[status] ?? status;
}

function hasOutsideAreaNote(attendance: Attendance) {
  return Boolean(attendance.notes?.includes('Entrada fuera del radio permitido'));
}

function getMonthKey(date = new Date()) {
  return formatDateKey(date).slice(0, 7);
}

function getMonthlyLateMinutes(attendances: Attendance[], monthKey = getMonthKey()) {
  return attendances
    .filter((attendance) => attendance.attendanceDate.startsWith(monthKey))
    .reduce((total, attendance) => total + attendance.lateMinutes, 0);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function assetUrl(value?: string | null) {
  if (!value) return '';
  if (value.startsWith('data:') || value.startsWith('http')) return value;
  return `${ASSET_URL}${value}`;
}

function authHeaders(session?: SessionUser | null, base: Record<string, string> = {}) {
  return session?.token ? { ...base, Authorization: `Bearer ${session.token}` } : base;
}

function useImageFallback(fallbackSrc: string) {
  return (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src.endsWith(fallbackSrc)) return;
    event.currentTarget.src = fallbackSrc;
  };
}

function compressVideoFrame(video: HTMLVideoElement) {
  const maxWidth = 720;
  const maxHeight = 720;
  const ratio = Math.min(maxWidth / video.videoWidth, maxHeight / video.videoHeight, 1);
  const width = Math.round(video.videoWidth * ratio);
  const height = Math.round(video.videoHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context?.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.68);
}

function getBrowserLocation(): Promise<GeoPoint | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let bestPosition: GeoPoint | undefined;
    let settled = false;

    const finish = (watchId?: number) => {
      if (settled) return;
      settled = true;
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
      resolve(bestPosition);
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        if (!bestPosition || nextPosition.accuracy < (bestPosition.accuracy ?? Number.POSITIVE_INFINITY)) {
          bestPosition = nextPosition;
        }

        if (nextPosition.accuracy <= 20) {
          finish(watchId);
        }
      },
      () => finish(watchId),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000,
      },
    );

    window.setTimeout(() => finish(watchId), 10000);
  });
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });
  const [view, setView] = useState<ViewKey>('today');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function showToast(text: string, tone: 'success' | 'error' | 'info' = 'info') {
    setToast({ text, tone });
  }

  async function loadData(user = session) {
    if (!user) return;

    const attendanceUrl =
      user.role === 'ADMIN' ? `${API_URL}/attendances` : `${API_URL}/attendances/ci/${user.ci}`;
    const employeesUrl =
      user.role === 'ADMIN' ? `${API_URL}/employees` : `${API_URL}/employees/ci/${user.ci}`;
    const headers = authHeaders(user);

    const [employeesResponse, attendancesResponse, configurationResponse, summaryResponse, holidaysResponse, auditResponse] = await Promise.all([
      fetch(employeesUrl, { headers }),
      fetch(attendanceUrl, { headers }),
      fetch(`${API_URL}/configuration/current`, { headers }),
      user.role === 'ADMIN' ? fetch(`${API_URL}/attendances/summary/today`, { headers }) : Promise.resolve(null),
      fetch(`${API_URL}/holidays`, { headers }),
      user.role === 'ADMIN' ? fetch(`${API_URL}/audit-logs`, { headers }) : Promise.resolve(null),
    ]);

    if ([employeesResponse, attendancesResponse, configurationResponse, holidaysResponse, summaryResponse, auditResponse].some((response) => response?.status === 401)) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      showToast('Sesion expirada. Inicie sesion nuevamente.', 'error');
      return;
    }

    const employeesPayload = (await employeesResponse.json()) as ApiList<Employee> | ApiItem<Employee>;
    const attendancesData = (await attendancesResponse.json()) as ApiList<Attendance>;
    const configurationData = (await configurationResponse.json()) as ApiItem<Configuration>;
    const summaryData = summaryResponse ? ((await summaryResponse.json()) as ApiItem<AttendanceSummary>) : { data: null };
    const holidaysData = (await holidaysResponse.json()) as ApiList<Holiday>;
    const auditData = auditResponse ? ((await auditResponse.json()) as ApiList<AuditLog>) : { data: [], total: 0 };

    setEmployees(Array.isArray(employeesPayload.data) ? employeesPayload.data : [employeesPayload.data]);
    setAttendances(attendancesData.data);
    setConfiguration(configurationData.data);
    setSummary(summaryData.data);
    setHolidays(holidaysData.data);
    setAuditLogs(auditData.data);
  }

  useEffect(() => {
    loadData().catch(() => showToast('No se pudo conectar con el backend.', 'error'));

    if (!session) return;

    const interval = setInterval(() => {
      loadData().catch(() => {});
    }, 8000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let timeoutId: number;

    function resetInactivityTimer() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        logout();
        showToast('Sesión cerrada automáticamente por inactividad de 10 minutos.', 'info');
      }, 10 * 60 * 1000);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer);
    });

    resetInactivityTimer();

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [session]);

  function handleLoggedIn(user: SessionUser) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setSession(user);
    setView(user.role === 'ADMIN' ? 'overview' : 'today');
    setToast(null);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setView('today');
    setSidebarOpen(false);
  }

  const currentUserAttendance = useMemo(() => {
    if (!session) return null;
    const today = formatDateKey(new Date());
    return attendances.find((attendance) => attendance.employeeId === session.id && attendance.attendanceDate === today);
  }, [attendances, session]);

  if (!session) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return (
    <main className="app-shell">
      <button
        className={`sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
        type="button"
        aria-label={sidebarOpen ? 'Ocultar menu' : 'Mostrar menu'}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <span />
      </button>
      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Cerrar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div>
          <p className="brand-kicker">Observatorio Agroambiental Productivo</p>
          <h1>Sistema de Asistencia Encuestadores</h1>
        </div>

        <div className="user-card">
          <strong>{session.fullName}</strong>
          <span>{session.role === 'ADMIN' ? 'Administrador' : session.position}</span>
        </div>

        <nav className="nav-list">
          {session.role === 'EMPLOYEE' ? (
            <>
              <button className={view === 'today' ? 'active' : ''} onClick={() => { setView('today'); setSidebarOpen(false); }}>
                Registro del dia
              </button>
              <button className={view === 'history' ? 'active' : ''} onClick={() => { setView('history'); setSidebarOpen(false); }}>
                Mi historial
              </button>
            </>
          ) : (
            <>
              <button className={view === 'overview' ? 'active' : ''} onClick={() => { setView('overview'); setSidebarOpen(false); }}>
                Vista general
              </button>
              <button className={view === 'employees' ? 'active' : ''} onClick={() => { setView('employees'); setSidebarOpen(false); }}>
                Funcionarios
              </button>
              <button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setSidebarOpen(false); }}>
                Configuracion
              </button>
              <button className={view === 'reports' ? 'active' : ''} onClick={() => { setView('reports'); setSidebarOpen(false); }}>
                Logs y reportes
              </button>
            </>
          )}
        </nav>

        <button className="logout-button" onClick={logout}>
          Cerrar sesion
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p>{formatFullDate(new Date())}</p>
          </div>
        </header>

        {toast && <Toast text={toast.text} tone={toast.tone} onClose={() => setToast(null)} />}

        {session.role === 'EMPLOYEE' && view === 'today' && (
          <EmployeeToday
            attendance={currentUserAttendance}
            attendances={attendances}
            onRegistered={(text, tone = 'info') => {
              showToast(text, tone);
              loadData();
            }}
            user={session}
          />
        )}

        {session.role === 'EMPLOYEE' && view === 'history' && (
          <AttendanceHistory attendances={attendances} employees={employees} holidays={holidays} title="Mi historial" employee={session} />
        )}

        {session.role === 'ADMIN' && view === 'overview' && (
          <AdminOverview
            attendances={attendances}
            configuration={configuration}
            employees={employees}
            holidays={holidays}
            onChanged={(text) => {
              showToast(text, 'success');
              loadData();
            }}
            session={session}
            summary={summary}
          />
        )}

        {session.role === 'ADMIN' && view === 'employees' && (
          <EmployeesPanel
            employees={employees}
            session={session}
            onChanged={(text) => {
              showToast(text);
              loadData();
            }}
          />
        )}

        {session.role === 'ADMIN' && view === 'settings' && (
          <SettingsPanel
            configuration={configuration}
            session={session}
            onSaved={(text) => {
              showToast(text, 'success');
              loadData();
            }}
            holidays={holidays}
          />
        )}

        {session.role === 'ADMIN' && view === 'reports' && (
          <ReportsPanel auditLogs={auditLogs} attendances={attendances} employees={employees} holidays={holidays} />
        )}
      </section>
    </main>
  );
}

function Toast({
  onClose,
  text,
  tone,
}: {
  onClose: () => void;
  text: string;
  tone: 'success' | 'error' | 'info';
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 5200);
    return () => window.clearTimeout(timeoutId);
  }, [onClose, text]);

  return (
    <div className={`toast-notice ${tone}`} role="status" aria-live="polite">
      <div>
        <strong>{tone === 'error' ? 'Atencion' : tone === 'success' ? 'Registro guardado' : 'Aviso'}</strong>
        <span>{text}</span>
      </div>
      <button aria-label="Cerrar aviso" onClick={onClose}>
        x
      </button>
    </div>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [ci, setCi] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ci: ci.trim() }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? 'No se pudo ingresar.');
        return;
      }

      onLoggedIn(body.data);
    } catch {
      setError('No se pudo conectar con el backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <div className="login-brand-stack">
            <img
              src="/logo-ministerio.png"
              alt="Ministerio de Desarrollo Productivo Rural y Agua"
              onError={useImageFallback('/brand-ministry.svg')}
            />
            <img
              src="/logo-oap.png"
              alt="Observatorio Agroambiental y Productivo"
              onError={useImageFallback('/brand-oap.svg')}
            />
          </div>
          <p className="brand-kicker">OAP 2026</p>
          <h1>Asistencia del personal Encuestador</h1>
        </div>

        <form className="login-form" onSubmit={submit}>
          <h2>Ingresar</h2>
          <label>
            Carnet de identidad
            <input value={ci} onChange={(event) => setCi(event.target.value)} placeholder="Ej. 1234567" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" disabled={loading}>
            {loading ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

function EmployeeToday({
  attendance,
  attendances,
  onRegistered,
  user,
}: {
  attendance: Attendance | null;
  attendances: Attendance[];
  onRegistered: (message: string, tone?: 'success' | 'error' | 'info') => void;
  user: SessionUser;
}) {
  const [pendingType, setPendingType] = useState<AttendanceType | null>(null);
  const [working, setWorking] = useState(false);
  const [entryObservation, setEntryObservation] = useState('');
  const [exitObservation, setExitObservation] = useState('');
  const monthlyLateMinutes = getMonthlyLateMinutes(attendances);

  function requestRegistration(type: AttendanceType) {
    if (type === 'ENTRY' && attendance?.entryTime) {
      onRegistered('No puedes registrar otra entrada hoy. La entrada ya fue guardada.', 'error');
      return;
    }

    if (type === 'EXIT' && attendance?.exitTime) {
      onRegistered('No puedes registrar otra salida hoy. La salida ya fue guardada.', 'error');
      return;
    }

    setPendingType(type);
  }

  async function register(type: AttendanceType, photoDataUrl: string) {
    setPendingType(null);
    setWorking(true);
    onRegistered('Foto capturada. Obteniendo ubicacion y registrando asistencia...');
    try {
      let location = await getBrowserLocation();
      while (!location) {
        const retry = window.confirm(
          "El sistema requiere acceso a su ubicación (GPS) para registrar la asistencia.\n\nPor favor:\n1. Habilite el GPS/ubicación de su dispositivo.\n2. Conceda permiso de ubicación al navegador.\n3. Presione 'Aceptar' para reintentar."
        );
        if (!retry) {
          onRegistered('Registro cancelado: Se requiere permiso de ubicación.', 'error');
          setWorking(false);
          return;
        }
        onRegistered('Reintentando obtener ubicación...');
        location = await getBrowserLocation();
      }
      const response = await fetch(`${API_URL}/attendances/register`, {
        method: 'POST',
        headers: authHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ci: user.ci,
          type,
          location,
          observation: type === 'ENTRY' ? entryObservation : exitObservation,
          photoDataUrl,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        onRegistered(body.message ?? 'No se pudo registrar.', 'error');
        return;
      }

      const locationMessage = location
        ? `${body.message}. Ubicacion registrada con precision aproximada de ${Math.round(
            location.accuracy ?? 0,
          )} m.`
        : `${body.message}. Se guardo sin ubicacion.`;
      onRegistered(locationMessage, 'success');
      if (type === 'ENTRY') {
        setEntryObservation('');
      } else {
        setExitObservation('');
      }
    } catch {
      onRegistered('No se pudo conectar con el backend.', 'error');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="employee-layout">
      <section className="hero-card">
        <p className="brand-kicker">Registro del dia</p>
        <h2>Hola, {user.fullName.split(' ')[0]}</h2>
        <p>Marca tu entrada o salida en pocos pasos. El sistema usa la hora del servidor.</p>

        <div className="today-status">
          <div>
            <span>Entrada</span>
            <strong>{formatTime(attendance?.entryTime ?? null)}</strong>
          </div>
          <div>
            <span>Salida</span>
            <strong>{formatTime(attendance?.exitTime ?? null)}</strong>
          </div>
          <div>
            <span>Retraso</span>
            <strong>{attendance?.lateMinutes ?? 0} min</strong>
          </div>
        </div>
        <div className="monthly-late-card">
          <span>Retraso acumulado del mes</span>
          <strong>{monthlyLateMinutes} min</strong>
        </div>
      </section>

      <section className="action-card">
        <h3>Marcacion rapida</h3>
        <p className="simple-help">
          Presiona entrada o salida. El sistema abrira la camara y tomara la ubicacion automaticamente.
        </p>

        <div className="big-actions">
          <button disabled={working} onClick={() => requestRegistration('ENTRY')}>
            Registrar entrada
          </button>
          <button disabled={working} onClick={() => requestRegistration('EXIT')}>
            Registrar salida
          </button>
        </div>
      </section>

      {pendingType && (
        <CameraModal
          title={pendingType === 'ENTRY' ? 'Fotografia para entrada' : 'Fotografia para salida'}
          observation={pendingType === 'ENTRY' ? entryObservation : exitObservation}
          observationLabel={pendingType === 'ENTRY' ? 'Observacion de entrada' : 'Observacion de salida'}
          onObservationChange={pendingType === 'ENTRY' ? setEntryObservation : setExitObservation}
          onCancel={() => setPendingType(null)}
          onConfirm={(photoDataUrl) => register(pendingType, photoDataUrl)}
        />
      )}
    </div>
  );
}

function CameraModal({
  onCancel,
  observation,
  observationLabel,
  onConfirm,
  onObservationChange,
  title,
}: {
  onCancel: () => void;
  observation: string;
  observationLabel: string;
  onConfirm: (photoDataUrl: string) => void;
  onObservationChange: (value: string) => void;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Preparando camara...');
  const [isReady, setIsReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState('');

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setCapturedPhoto('');
    setError('');
    setIsReady(false);
    setStatus('Solicitando permiso de camara...');
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite abrir la camara desde esta pagina.');
      setStatus('Camara no disponible');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStatus('Camara lista');
      setError('');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
      }
    } catch {
      setIsReady(false);
      setStatus('Permiso pendiente');
      setError('No se pudo abrir la camara. Permite el acceso y toca Reintentar camara.');
    }
  }

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError('La camara aun no esta lista.');
      return;
    }

    setError('');
    const compressedPhoto = compressVideoFrame(video);
    stopCamera();
    setCapturedPhoto(compressedPhoto);
    setIsReady(false);
    setStatus('Foto capturada. Revisa antes de guardar.');
  }

  function retakePhoto() {
    setCapturedPhoto('');
    window.setTimeout(() => {
      startCamera();
    }, 0);
  }

  return (
    <div className="camera-backdrop">
      <section className="camera-modal">
        <div className="camera-header">
          <h3>{title}</h3>
          <button onClick={onCancel}>Cancelar</button>
        </div>
        {capturedPhoto ? (
          <img className="camera-preview captured" src={capturedPhoto} alt="Foto capturada" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
        )}
        <p className={`camera-status ${isReady || capturedPhoto ? 'ready' : ''}`}>{status}</p>
        {error && <p className="form-error">{error}</p>}
        {capturedPhoto && (
          <label className="capture-observation">
            {observationLabel}
            <textarea
              placeholder="Opcional. Escribe aqui si necesitas aclarar algo."
              value={observation}
              onChange={(event) => onObservationChange(event.target.value)}
            />
          </label>
        )}
        <div className={`camera-actions ${capturedPhoto ? 'confirming' : ''}`}>
          {error && (
            <button className="retry-button" onClick={startCamera}>
              Reintentar camara
            </button>
          )}
          {capturedPhoto ? (
            <>
              <button className="retry-button" onClick={retakePhoto}>
                Tomar nueva foto
              </button>
              <button className="capture-button" onClick={() => onConfirm(capturedPhoto)}>
                Guardar registro
              </button>
            </>
          ) : (
            <button className="capture-button" disabled={!isReady} onClick={capture}>
              Tomar foto
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function AdminOverview({
  attendances,
  configuration,
  employees,
  holidays,
  onChanged,
  session,
  summary,
}: {
  attendances: Attendance[];
  configuration: Configuration | null;
  employees: Employee[];
  holidays: Holiday[];
  onChanged: (message: string) => void;
  session: SessionUser;
  summary: AttendanceSummary | null;
}) {
  const activeEmployees = employees.filter((employee) => employee.status === 'ACTIVE');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(activeEmployees[0]?.id ?? '');
  const [showPastAlerts, setShowPastAlerts] = useState(false);
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const filteredAttendances = selectedEmployeeId
    ? attendances.filter((attendance) => attendance.employeeId === selectedEmployeeId)
    : attendances;
  const monthlyLateMinutes = getMonthlyLateMinutes(filteredAttendances);
  
  const todayKey = formatDateKey(new Date());
  const todayRecords = filteredAttendances.filter((att) => att.attendanceDate === todayKey && att.entryTime);
  const pastAlerts = filteredAttendances.filter((att) => att.attendanceDate < todayKey && hasOutsideAreaNote(att));

  useEffect(() => {
    if (!selectedEmployeeId && activeEmployees[0]) {
      setSelectedEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, selectedEmployeeId]);

  return (
    <>
      <section className="metric-grid">
        <Metric label="Funcionarios activos" value={summary?.activeEmployees ?? 0} tone="green" />
        <Metric label="Registrados hoy" value={summary?.registered ?? 0} tone="blue" />
        <Metric label="Con retraso" value={summary?.late ?? 0} tone="orange" />
        <Metric label="Retraso mes" value={`${monthlyLateMinutes} min`} tone="amber" />
        <Metric label="Fuera de area" value={summary?.outsideArea ?? 0} tone="cyan" />
        <Metric label="Pendientes" value={summary?.pending ?? 0} tone="red" />
      </section>
      <section className="admin-filter-panel">
        <label>
          Seleccionar funcionario
          <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
            <option value="">Todos los funcionarios</option>
            {activeEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} - CI {employee.ci}
              </option>
            ))}
          </select>
        </label>
        {selectedEmployee && (
          <div className="selected-employee-card">
            {selectedEmployee.profilePhotoUrl ? (
              <img src={assetUrl(selectedEmployee.profilePhotoUrl)} alt="" />
            ) : (
              <span>{selectedEmployee.fullName.slice(0, 1)}</span>
            )}
            <div>
              <strong>{selectedEmployee.fullName}</strong>
              <small>{selectedEmployee.position}</small>
            </div>
          </div>
        )}
      </section>
      <section className="monthly-admin-panel">
        <div>
          <span>Acumulado mensual de retraso</span>
          <strong>{monthlyLateMinutes} min</strong>
        </div>
      </section>
      <section className="outside-area-panel">
        <div className="panel-header-gps">
          <h3>Monitoreo de GPS</h3>
          <p>Marcaciones de hoy y validación de rango.</p>
        </div>
        
        <div className="today-gps-list">
          {todayRecords.length === 0 ? (
            <span className="empty-alert">Sin marcaciones registradas hoy.</span>
          ) : (
            todayRecords.map((attendance) => {
              const employee = employees.find((item) => item.id === attendance.employeeId);
              const hasGps = attendance.entryLocation?.latitude && attendance.entryLocation?.longitude;
              const isOutside = hasOutsideAreaNote(attendance);
              
              let statusLabel = '';
              let statusClass = '';
              let detailText = '';
              
              if (!hasGps) {
                statusLabel = 'Sin GPS / Permiso denegado';
                statusClass = 'status-no-gps';
                detailText = 'No se capturaron coordenadas de ubicación para esta marca.';
              } else if (isOutside) {
                statusLabel = 'Fuera de rango';
                statusClass = 'status-outside';
                detailText = (attendance.notes ?? '').replace(/,\s*radio permitido\s*\d+\s*m/gi, '');
              } else {
                statusLabel = 'Dentro de rango';
                statusClass = 'status-inside';
                detailText = 'Ubicación validada correctamente.';
              }

              return (
                <article key={attendance.id} className="gps-record">
                  <div className="gps-record-header">
                    <strong>{employee?.fullName ?? 'Funcionario'}</strong>
                    <span className="gps-record-time">{formatTime(attendance.entryTime)}</span>
                    <span className={`gps-badge ${statusClass}`}>{statusLabel}</span>
                  </div>
                  <small className="gps-record-detail">{detailText}</small>
                </article>
              );
            })
          )}
        </div>

        <div className="past-gps-toggle-container">
          <button 
            type="button"
            className="past-gps-toggle-btn"
            onClick={() => setShowPastAlerts(!showPastAlerts)}
          >
            <span>{showPastAlerts ? '▼' : '▶'} Alertas de días anteriores</span>
            <span className="past-alerts-count">({pastAlerts.length})</span>
          </button>
        </div>

        {showPastAlerts && (
          <div className="past-gps-list">
            {pastAlerts.length === 0 ? (
              <span className="empty-alert">Sin alertas en días anteriores.</span>
            ) : (
              pastAlerts.map((attendance) => {
                const employee = employees.find((item) => item.id === attendance.employeeId);
                const cleanNotes = (attendance.notes ?? '').replace(/,\s*radio permitido\s*\d+\s*m/gi, '');
                return (
                  <article key={attendance.id} className="gps-record past-record">
                    <div className="gps-record-header">
                      <strong>{employee?.fullName ?? 'Funcionario'}</strong>
                      <span className="gps-record-time">
                        {attendance.attendanceDate} - {formatTime(attendance.entryTime)}
                      </span>
                      <span className="gps-badge status-outside">Fuera de rango</span>
                    </div>
                    <small className="gps-record-detail">{cleanNotes}</small>
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>
      <AttendanceHistory
        attendances={filteredAttendances}
        configuration={configuration}
        employees={employees}
        holidays={holidays}
        onChanged={onChanged}
        session={session}
        canManage
        title={selectedEmployee ? `Asistencia de ${selectedEmployee.fullName}` : 'Asistencia general'}
        employee={selectedEmployee}
      />
    </>
  );
}

function Metric({ label, tone, value }: { label: string; tone: string; value: number | string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmployeesPanel({
  employees,
  onChanged,
  session,
}: {
  employees: Employee[];
  onChanged: (message: string) => void;
  session: SessionUser;
}) {
  const emptyForm = {
    id: '',
    ci: '',
    fullName: '',
    position: '',
    department: '',
    departamentoBolivia: 'La Paz',
    phone: '',
    role: 'EMPLOYEE' as Role,
    profilePhotoDataUrl: '',
    locationControlEnabled: false,
    locationRadiusMeters: '800',
    locationPoints: [] as LocationPoint[],
  };
  const [form, setForm] = useState({ ...emptyForm });

  async function onProfileSelected(file?: File) {
    if (!file) return;
    setForm({ ...form, profilePhotoDataUrl: await readFileAsDataUrl(file) });
  }

  function editEmployee(employee: Employee) {
    setForm({
      id: employee.id,
      ci: employee.ci,
      fullName: employee.fullName,
      position: employee.position,
      department: employee.department ?? '',
      departamentoBolivia: employee.departamentoBolivia ?? 'La Paz',
      phone: employee.phone ?? '',
      role: employee.role,
      profilePhotoDataUrl: '',
      locationControlEnabled: Boolean(employee.locationControlEnabled),
      locationRadiusMeters: String(employee.locationRadiusMeters ?? 800),
      locationPoints: employee.locationPoints?.length
        ? employee.locationPoints
        : [],
    });
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(form.id ? `${API_URL}/employees/${form.id}` : `${API_URL}/employees`, {
      method: form.id ? 'PUT' : 'POST',
      headers: authHeaders(session, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ci: form.ci,
        fullName: form.fullName,
        position: form.position,
        department: form.department || null,
        departamentoBolivia: form.departamentoBolivia || 'La Paz',
        phone: form.phone || null,
        role: form.role,
        profilePhotoDataUrl: form.profilePhotoDataUrl || null,
        locationControlEnabled: form.locationControlEnabled,
        locationRadiusMeters: form.locationRadiusMeters || 800,
        locationPoints: form.locationPoints,
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      onChanged(body.message ?? 'No se pudo guardar funcionario.');
      return;
    }

    setForm({ ...emptyForm });
    onChanged(body.message);
  }

  async function deleteEmployee(employee: Employee) {
    const response = await fetch(`${API_URL}/employees/${employee.id}`, { method: 'DELETE', headers: authHeaders(session) });
    const body = await response.json();
    onChanged(body.message ?? 'Funcionario eliminado.');
  }

  return (
    <div className="split-layout">
      <form className="panel-form" onSubmit={saveEmployee}>
        <h3>{form.id ? 'Editar funcionario' : 'Nuevo funcionario'}</h3>
        <div className="profile-loader">
          <div className="profile-preview">
            {form.profilePhotoDataUrl ? <img src={form.profilePhotoDataUrl} alt="Perfil" /> : <span>Foto</span>}
          </div>
          <label>
            Foto de perfil
            <input accept="image/*" type="file" onChange={(event) => onProfileSelected(event.target.files?.[0])} />
          </label>
        </div>
        <input placeholder="CI" value={form.ci} onChange={(event) => setForm({ ...form, ci: event.target.value })} />
        <input placeholder="Nombre completo" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <input placeholder="Cargo" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
        <input placeholder="Unidad o departamento" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
        <select value={form.departamentoBolivia} onChange={(event) => setForm({ ...form, departamentoBolivia: event.target.value })}>
          <option value="La Paz">La Paz</option>
          <option value="Santa Cruz">Santa Cruz</option>
          <option value="Cochabamba">Cochabamba</option>
          <option value="Oruro">Oruro</option>
          <option value="Potosí">Potosí</option>
          <option value="Tarija">Tarija</option>
          <option value="Chuquisaca">Chuquisaca</option>
          <option value="Beni">Beni</option>
          <option value="Pando">Pando</option>
        </select>
        <input placeholder="Telefono" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
          <option value="EMPLOYEE">Empleado</option>
          <option value="ADMIN">Administrador</option>
        </select>
        <LocationControlEditor
          enabled={form.locationControlEnabled}
          points={form.locationPoints}
          radiusMeters={form.locationRadiusMeters}
          onEnabledChange={(locationControlEnabled) => setForm({ ...form, locationControlEnabled })}
          onPointsChange={(locationPoints) => setForm({ ...form, locationPoints })}
          onRadiusChange={(locationRadiusMeters) => setForm({ ...form, locationRadiusMeters })}
        />
        <div className="form-actions">
          <button className="primary-action">{form.id ? 'Actualizar funcionario' : 'Guardar funcionario'}</button>
          {form.id && <button type="button" onClick={() => setForm({ ...emptyForm })}>Cancelar</button>}
        </div>
      </form>

      <section className="data-panel">
        <h3>Funcionarios registrados</h3>
        <div className="employee-list">
          {employees.map((employee) => (
            <article className={employee.status === 'INACTIVE' ? 'inactive' : ''} key={employee.id}>
              {employee.profilePhotoUrl ? <img className="employee-avatar" src={assetUrl(employee.profilePhotoUrl)} alt="" /> : <div className="employee-avatar placeholder">{employee.fullName.slice(0, 1)}</div>}
              <div>
                <strong>{employee.fullName}</strong>
                <span>CI {employee.ci} - {employee.position} ({employee.departamentoBolivia ?? 'La Paz'}) - {employee.role === 'ADMIN' ? 'Admin' : 'Empleado'}</span>
              </div>
              <div className="row-actions">
                <button onClick={() => editEmployee(employee)}>Editar</button>
                <button onClick={() => deleteEmployee(employee)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const LOCATION_DEFAULT_ZOOM = 15;
const LOCATION_MIN_ZOOM = 5;
const LOCATION_MAX_ZOOM = 18;
const LOCATION_TILE_SIZE = 256;

function locationToWorld(latitude: number, longitude: number, zoom: number) {
  const scale = LOCATION_TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function worldToLocation(x: number, y: number, zoom: number) {
  const scale = LOCATION_TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / scale)) * 180) / Math.PI;

  return { latitude, longitude };
}

function metersToPixels(meters: number, latitude: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return meters / metersPerPixel;
}

function LocationControlEditor({
  enabled,
  onEnabledChange,
  onPointsChange,
  onRadiusChange,
  points,
  radiusMeters,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onPointsChange: (points: LocationPoint[]) => void;
  onRadiusChange: (radiusMeters: string) => void;
  points: LocationPoint[];
  radiusMeters: string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 260 });
  const [mapZoom, setMapZoom] = useState(LOCATION_DEFAULT_ZOOM);
  const [mapCenter, setMapCenter] = useState(() => ({
    latitude: points[0]?.latitude ?? -16.5,
    longitude: points[0]?.longitude ?? -68.15,
  }));
  const [dragStart, setDragStart] = useState<{
    center: { latitude: number; longitude: number };
    x: number;
    y: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const selectedPoint = points[0];
  const radiusValue = Math.max(1, Number(radiusMeters) || 1);

  useEffect(() => {
    if (!selectedPoint) return;
    setMapCenter({ latitude: selectedPoint.latitude, longitude: selectedPoint.longitude });
  }, [selectedPoint?.id]);

  const centerWorld = locationToWorld(mapCenter.latitude, mapCenter.longitude, mapZoom);
  const mapStart = {
    x: centerWorld.x - mapSize.width / 2,
    y: centerWorld.y - mapSize.height / 2,
  };
  const mapTiles = useMemo(() => {
    if (!mapSize.width) return [];

    const firstTileX = Math.floor(mapStart.x / LOCATION_TILE_SIZE);
    const lastTileX = Math.floor((mapStart.x + mapSize.width) / LOCATION_TILE_SIZE);
    const firstTileY = Math.floor(mapStart.y / LOCATION_TILE_SIZE);
    const lastTileY = Math.floor((mapStart.y + mapSize.height) / LOCATION_TILE_SIZE);
    const maxTile = 2 ** mapZoom;
    const tiles: Array<{ key: string; left: number; top: number; x: number; y: number }> = [];

    for (let x = firstTileX; x <= lastTileX; x += 1) {
      for (let y = firstTileY; y <= lastTileY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        tiles.push({
          key: `${mapZoom}-${wrappedX}-${y}`,
          left: x * LOCATION_TILE_SIZE - mapStart.x,
          top: y * LOCATION_TILE_SIZE - mapStart.y,
          x: wrappedX,
          y,
        });
      }
    }

    return tiles;
  }, [mapSize.width, mapSize.height, mapStart.x, mapStart.y, mapZoom]);

  useEffect(() => {
    if (!mapRef.current) return;

    const updateSize = () => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      setMapSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(mapRef.current);

    return () => observer.disconnect();
  }, []);

  function addPoint(point?: Partial<LocationPoint>) {
    onPointsChange([
      ...points,
      {
        id: crypto.randomUUID(),
        name: point?.name ?? `Punto ${points.length + 1}`,
        latitude: point?.latitude ?? mapCenter.latitude,
        longitude: point?.longitude ?? mapCenter.longitude,
      },
    ]);
  }

  function updatePoint(index: number, field: keyof LocationPoint, value: string) {
    const nextPoints = [...points];
    const current = nextPoints[index];
    nextPoints[index] = {
      ...current,
      [field]: field === 'latitude' || field === 'longitude' ? Number(value) : value,
    };
    onPointsChange(nextPoints);
  }

  async function addCurrentLocation() {
    const location = await getBrowserLocation();

    if (!location) {
      addPoint();
      return;
    }

    addPoint({
      name: `Punto ${points.length + 1}`,
      latitude: Number(location.latitude.toFixed(7)),
      longitude: Number(location.longitude.toFixed(7)),
    });
  }

  function addPointFromMap(event: MouseEvent<HTMLDivElement>) {
    if (!enabled || !mapRef.current || dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    const rect = mapRef.current.getBoundingClientRect();
    const worldPoint = {
      x: mapStart.x + event.clientX - rect.left,
      y: mapStart.y + event.clientY - rect.top,
    };
    const location = worldToLocation(worldPoint.x, worldPoint.y, mapZoom);

    addPoint({
      name: `Punto ${points.length + 1}`,
      latitude: Number(location.latitude.toFixed(7)),
      longitude: Number(location.longitude.toFixed(7)),
    });
  }

  function zoomMap(nextZoom: number, pivot?: { x: number; y: number }) {
    const clampedZoom = Math.min(LOCATION_MAX_ZOOM, Math.max(LOCATION_MIN_ZOOM, nextZoom));
    if (clampedZoom === mapZoom) return;

    const pivotPoint = pivot ?? { x: mapSize.width / 2, y: mapSize.height / 2 };
    const pivotLocation = worldToLocation(mapStart.x + pivotPoint.x, mapStart.y + pivotPoint.y, mapZoom);
    const nextPivotWorld = locationToWorld(pivotLocation.latitude, pivotLocation.longitude, clampedZoom);
    const nextCenterWorld = {
      x: nextPivotWorld.x - pivotPoint.x + mapSize.width / 2,
      y: nextPivotWorld.y - pivotPoint.y + mapSize.height / 2,
    };

    setMapZoom(clampedZoom);
    setMapCenter(worldToLocation(nextCenterWorld.x, nextCenterWorld.y, clampedZoom));
  }

  function handleMapWheel(event: WheelEvent) {
    if (!enabled || !mapRef.current) return;

    event.preventDefault();
    const rect = mapRef.current.getBoundingClientRect();
    zoomMap(mapZoom + (event.deltaY < 0 ? 1 : -1), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    mapElement.addEventListener('wheel', handleMapWheel, { passive: false });

    return () => {
      mapElement.removeEventListener('wheel', handleMapWheel);
    };
  }, [enabled, mapZoom, mapStart.x, mapStart.y, mapSize.width, mapSize.height]);

  function handleMapMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart) return;
    if (Math.abs(event.clientX - dragStart.x) > 3 || Math.abs(event.clientY - dragStart.y) > 3) {
      dragMovedRef.current = true;
    }

    const startWorld = locationToWorld(dragStart.center.latitude, dragStart.center.longitude, mapZoom);
    const nextWorld = {
      x: startWorld.x - (event.clientX - dragStart.x),
      y: startWorld.y - (event.clientY - dragStart.y),
    };

    setMapCenter(worldToLocation(nextWorld.x, nextWorld.y, mapZoom));
  }

  return (
    <section className="location-editor">
      <label className={`switch-line ${enabled ? 'active' : ''}`}>
        <input checked={enabled} type="checkbox" onChange={(event) => onEnabledChange(event.target.checked)} />
        <span className="switch-control" aria-hidden="true" />
        <span>
          <strong>Controlar ubicacion de entrada</strong>
          <small>{enabled ? 'Activo' : 'Desactivado'}</small>
        </span>
      </label>

      <label>
        Radio permitido en metros
        <input
          disabled={!enabled}
          min="1"
          type="number"
          value={radiusMeters}
          onChange={(event) => onRadiusChange(event.target.value)}
        />
      </label>

      <div className="location-guide">
        <strong>Como colocar un punto</strong>
        <span>Arrastra el mapa para ubicar la zona, usa + o - para acercar, y haz clic directamente sobre el lugar donde debe quedar el punto.</span>
      </div>

      <div
        className={`location-map ${enabled ? 'is-clickable' : ''} ${dragStart ? 'is-dragging' : ''}`}
        onMouseDown={(event) => {
          if (!enabled) return;
          dragMovedRef.current = false;
          setDragStart({ center: mapCenter, x: event.clientX, y: event.clientY });
        }}
        onMouseLeave={() => setDragStart(null)}
        onMouseMove={handleMapMouseMove}
        onMouseUp={() => window.setTimeout(() => setDragStart(null), 0)}
        onClick={addPointFromMap}
        ref={mapRef}
        role="button"
        aria-label={enabled ? 'Mapa para agregar puntos de ubicacion con clic' : 'Mapa de puntos de ubicacion desactivado'}
        tabIndex={enabled ? 0 : -1}
      >
        {mapTiles.map((tile) => (
          <img
            alt=""
            draggable={false}
            key={tile.key}
            src={`https://tile.openstreetmap.org/${mapZoom}/${tile.x}/${tile.y}.png`}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        {points.map((point, index) => {
          const world = locationToWorld(point.latitude, point.longitude, mapZoom);
          const left = world.x - mapStart.x;
          const top = world.y - mapStart.y;
          const radiusPixels = metersToPixels(radiusValue, point.latitude, mapZoom);

          return (
            <div className="location-point-layer" key={point.id}>
              <span
                className="location-radius"
                style={{
                  height: radiusPixels * 2,
                  left,
                  top,
                  width: radiusPixels * 2,
                }}
              />
              <span className="location-marker" style={{ left, top }} title={point.name}>
                {index + 1}
              </span>
            </div>
          );
        })}
        <div className="location-zoom-controls" onClick={(event) => event.stopPropagation()}>
          <button disabled={!enabled || mapZoom >= LOCATION_MAX_ZOOM} type="button" onClick={() => zoomMap(mapZoom + 1)}>
            +
          </button>
          <button disabled={!enabled || mapZoom <= LOCATION_MIN_ZOOM} type="button" onClick={() => zoomMap(mapZoom - 1)}>
            -
          </button>
        </div>
        <div className="location-map-hint">
          {enabled ? 'Clic en el mapa = nuevo punto' : 'Activa el control para seleccionar puntos'}
        </div>
      </div>

      <div className="location-actions">
        <button disabled={!enabled} type="button" onClick={() => addPoint()}>
          Agregar en la vista actual
        </button>
        <button disabled={!enabled} type="button" onClick={addCurrentLocation}>
          Usar ubicacion actual
        </button>
      </div>

      <div className="location-points">
        {points.map((point, index) => (
          <div key={point.id}>
            <input
              disabled={!enabled}
              placeholder="Nombre del punto"
              value={point.name}
              onChange={(event) => updatePoint(index, 'name', event.target.value)}
            />
            <input
              disabled={!enabled}
              placeholder="Latitud"
              step="0.0000001"
              type="number"
              value={point.latitude}
              onChange={(event) => updatePoint(index, 'latitude', event.target.value)}
            />
            <input
              disabled={!enabled}
              placeholder="Longitud"
              step="0.0000001"
              type="number"
              value={point.longitude}
              onChange={(event) => updatePoint(index, 'longitude', event.target.value)}
            />
            <a href={`https://www.google.com/maps?q=${point.latitude},${point.longitude}`} rel="noreferrer" target="_blank">
              Ver
            </a>
            <button disabled={!enabled} type="button" onClick={() => onPointsChange(points.filter((_, pointIndex) => pointIndex !== index))}>
              Quitar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({
  configuration,
  holidays,
  onSaved,
  session,
}: {
  configuration: Configuration | null;
  holidays: Holiday[];
  onSaved: (message: string) => void;
  session: SessionUser;
}) {
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const [configurationError, setConfigurationError] = useState('');
  const [holidayError, setHolidayError] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null);
  const [form, setForm] = useState({
    entryTime: configuration?.entryTime ?? '06:30',
    exitTime: configuration?.exitTime ?? '15:00',
    toleranceMinutes: String(configuration?.toleranceMinutes ?? 0),
  });

  useEffect(() => {
    if (!configuration) return;
    setForm({
      entryTime: configuration.entryTime,
      exitTime: configuration.exitTime,
      toleranceMinutes: String(configuration.toleranceMinutes ?? 0),
    });
  }, [configuration]);

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingConfiguration(true);
    setConfigurationError('');

    try {
      const response = await fetch(`${API_URL}/configuration/current`, {
        method: 'PUT',
        headers: authHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          entryTime: form.entryTime,
          exitTime: form.exitTime,
          toleranceMinutes: Number(form.toleranceMinutes),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setConfigurationError(body.message ?? 'No se pudo guardar la configuracion.');
        return;
      }

      onSaved(body.message ?? 'Nueva configuracion guardada. Aplicara desde este momento.');
    } catch {
      setConfigurationError('No se pudo conectar con el backend.');
    } finally {
      setSavingConfiguration(false);
    }
  }

  const [selectedDepts, setSelectedDepts] = useState<string[]>([...BOLIVIA_DEPARTMENTS]);
  const selectAll = selectedDepts.length === BOLIVIA_DEPARTMENTS.length;
  function handleToggleSelectAll() {
    if (selectAll) {
      setSelectedDepts([]);
    } else {
      setSelectedDepts([...BOLIVIA_DEPARTMENTS]);
    }
  }

  function handleToggleDept(dept: string) {
    if (selectedDepts.includes(dept)) {
      setSelectedDepts(selectedDepts.filter(d => d !== dept));
    } else {
      setSelectedDepts([...selectedDepts, dept]);
    }
  }

  async function saveHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const holidayForm = event.currentTarget;
    const formData = new FormData(holidayForm);
    setSavingHoliday(true);
    setHolidayError('');

    try {
      const response = await fetch(`${API_URL}/holidays`, {
        method: 'POST',
        headers: authHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          date: formData.get('date'),
          name: formData.get('name'),
          description: formData.get('description') || null,
          departments: selectedDepts,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setHolidayError(body.message ?? 'No se pudo guardar el feriado.');
        return;
      }

      holidayForm.reset();
      setSelectedDepts([...BOLIVIA_DEPARTMENTS]);
      onSaved(body.message ?? 'Feriado guardado.');
    } catch {
      setHolidayError('No se pudo conectar con el backend.');
    } finally {
      setSavingHoliday(false);
    }
  }

  async function deleteHoliday(id: string) {
    setDeletingHolidayId(id);
    setHolidayError('');

    try {
      const response = await fetch(`${API_URL}/holidays/${id}`, { method: 'DELETE', headers: authHeaders(session) });
      const body = await response.json();

      if (!response.ok) {
        setHolidayError(body.message ?? 'No se pudo eliminar el feriado.');
        return;
      }

      onSaved(body.message ?? 'Feriado eliminado.');
    } catch {
      setHolidayError('No se pudo conectar con el backend.');
    } finally {
      setDeletingHolidayId(null);
    }
  }

  return (
    <div className="settings-stack">
      <form className="data-panel settings-form" onSubmit={saveConfiguration}>
        <h3>Configuracion institucional</h3>
        <div className="settings-grid editable">
          <label>Hora de ingreso<input type="time" value={form.entryTime} onChange={(event) => setForm({ ...form, entryTime: event.target.value })} /></label>
          <label>Hora de salida<input type="time" value={form.exitTime} onChange={(event) => setForm({ ...form, exitTime: event.target.value })} /></label>
          <label>Tolerancia en minutos<input min="0" type="number" value={form.toleranceMinutes} onChange={(event) => setForm({ ...form, toleranceMinutes: event.target.value })} /></label>
        </div>
        <div className="form-actions">
          <button className="primary-action" disabled={savingConfiguration}>
            {savingConfiguration ? 'Guardando...' : 'Guardar nueva configuracion'}
          </button>
        </div>
        {configurationError && <p className="form-error">{configurationError}</p>}
      </form>

      <section className="data-panel settings-form">
        <h3>Feriados</h3>
        <form className="holiday-form" onSubmit={saveHoliday}>
          <input name="date" required type="date" />
          <input name="name" placeholder="Nombre del feriado" required />
          <input name="description" placeholder="Descripcion opcional" />
          
          <div className="holiday-departments-select" style={{ gridColumn: 'span 3', margin: '8px 0' }}>
            <label style={{ display: 'block', margin: '4px 0 8px', fontWeight: 'bold', fontSize: '13px', color: '#1e293b' }}>
              Departamentos de Bolivia aplicables:
            </label>
            <div className="holiday-departments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: '#0f766e' }}>
                <input type="checkbox" checked={selectAll} onChange={handleToggleSelectAll} />
                <span>TODOS</span>
              </label>
              {BOLIVIA_DEPARTMENTS.map((dept) => (
                <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={selectedDepts.includes(dept)}
                    onChange={() => handleToggleDept(dept)}
                  />
                  <span>{dept}</span>
                </label>
              ))}
            </div>
          </div>

          <button className="primary-action" disabled={savingHoliday} style={{ gridColumn: 'span 3', width: 'fit-content', justifySelf: 'end' }}>
            {savingHoliday ? 'Guardando...' : 'Guardar feriado'}
          </button>
        </form>
        {holidayError && <p className="form-error">{holidayError}</p>}
        <div className="holiday-list">
          {holidays.map((holiday) => (
            <div key={holiday.id}>
              <strong>{holiday.date}</strong>
              <span>
                {holiday.name}{' '}
                <small style={{ display: 'block', color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                  Depto: {holiday.departments && holiday.departments.length > 0 ? (holiday.departments.length === 9 ? 'Todos' : holiday.departments.join(', ')) : 'Todos'}
                </small>
              </span>
              <button type="button" disabled={deletingHolidayId === holiday.id} onClick={() => deleteHoliday(holiday.id)}>
                {deletingHolidayId === holiday.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type ExportColumnKey =
  | 'date'
  | 'employee'
  | 'position'
  | 'entryTime'
  | 'exitTime'
  | 'status'
  | 'lateMinutes'
  | 'entryObservation'
  | 'exitObservation'
  | 'notes';

const EXPORT_COLUMNS: Array<{ key: ExportColumnKey; label: string }> = [
  { key: 'date', label: 'Fecha' },
  { key: 'employee', label: 'Nombre completo' },
  { key: 'position', label: 'Cargo' },
  { key: 'entryTime', label: 'Hora entrada' },
  { key: 'exitTime', label: 'Hora salida' },
  { key: 'status', label: 'Estado' },
  { key: 'lateMinutes', label: 'Retraso' },
  { key: 'entryObservation', label: 'Obs. entrada' },
  { key: 'exitObservation', label: 'Obs. salida' },
  { key: 'notes', label: 'Obs. interna' },
];

function ReportsPanel({
  auditLogs,
  attendances,
  employees,
  holidays,
}: {
  auditLogs: AuditLog[];
  attendances: Attendance[];
  employees: Employee[];
  holidays: Holiday[];
}) {
  const currentMonth = getMonthKey();
  const availableMonths = Array.from(new Set(attendances.map((attendance) => attendance.attendanceDate.slice(0, 7)))).sort().reverse();
  const defaultExportMonth = availableMonths[0] ?? currentMonth;
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(defaultExportMonth);
  const [columns, setColumns] = useState<ExportColumnKey[]>(['date', 'employee', 'position', 'entryTime', 'exitTime']);
  const [previewOpen, setPreviewOpen] = useState(false);
  const rows = getExportRows(attendances, employees, holidays, employeeId, month);
  const selectedColumns = EXPORT_COLUMNS.filter((column) => columns.includes(column.key));

  useEffect(() => {
    if (attendances.length > 0 && rows.length === 0 && availableMonths.length > 0 && month === currentMonth) {
      setMonth(defaultExportMonth);
    }
  }, [attendances.length, availableMonths.length, currentMonth, defaultExportMonth, month, rows.length]);

  function toggleColumn(column: ExportColumnKey) {
    setColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
    );
  }

  return (
    <div className="reports-stack">
      <section className="data-panel report-export-panel">
        <div className="report-header">
          <div>
            <h3>Exportar asistencia</h3>
            <p>{rows.length} registros listos para exportar.</p>
          </div>
          <div className="report-actions">
            <button type="button" onClick={() => exportAttendanceExcel(rows, columns, month)}>
              Exportar Excel
            </button>
            <button type="button" onClick={() => exportAttendancePdf(rows, columns, month)}>
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="report-filters">
          <label>
            Mes a exportar
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label>
            Mes con registros
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {availableMonths.length === 0 ? (
                <option value={month}>Sin registros</option>
              ) : (
                availableMonths.map((item) => (
                  <option key={item} value={item}>
                    {new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(new Date(`${item}-01T00:00:00`))}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Funcionario
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Todos</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="column-checklist">
          {EXPORT_COLUMNS.map((column) => (
            <label key={column.key}>
              <input
                checked={columns.includes(column.key)}
                type="checkbox"
                onChange={() => toggleColumn(column.key)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>

        <details className="export-preview" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
          <summary>Vista previa ({rows.length} registros)</summary>
          <div>
            {rows.length === 0 ? (
              <p>No hay registros para el mes y funcionario seleccionado.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>{selectedColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, rowIndex) => (
                      <tr key={`${row.date}-${row.employee}-${rowIndex}`}>
                        {selectedColumns.map((column) => <td key={column.key}>{row[column.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      </section>

      <section className="data-panel">
        <h3>Logs del sistema</h3>
        <div className="audit-list">
          {auditLogs.map((log) => (
            <article key={log.id}>
              <div className="audit-title">
                <strong>{auditActionLabel(log.action)}</strong>
                <code>{log.action}</code>
              </div>
              <dl className="audit-grid">
                <div>
                  <dt>Fecha/hora</dt>
                  <dd>{formatAuditDate(log.createdAt)}</dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>{log.actor ? `${log.actor.name} - CI ${log.actor.ci}` : 'Sistema'}</dd>
                </div>
                <div>
                  <dt>Entidad</dt>
                  <dd>{log.entity}</dd>
                </div>
                <div>
                  <dt>Afectado</dt>
                  <dd>{auditTargetLabel(log)}</dd>
                </div>
              </dl>
              <p className="audit-summary">{auditChangeSummary(log)}</p>
              <details className="audit-json">
                <summary>Ver datos tecnicos</summary>
                <pre>{JSON.stringify({ oldValue: log.oldValue, newValue: log.newValue }, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function getExportRows(
  attendances: Attendance[],
  employees: Employee[],
  holidays: Holiday[],
  employeeId: string,
  month: string,
) {
  const holidaysByDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));

  return attendances
    .filter((attendance) => attendance.attendanceDate.startsWith(month))
    .filter((attendance) => !employeeId || attendance.employeeId === employeeId)
    .sort((a, b) => `${a.attendanceDate}${a.entryTime ?? ''}`.localeCompare(`${b.attendanceDate}${b.entryTime ?? ''}`))
    .map((attendance) => {
      const employee = employees.find((item) => item.id === attendance.employeeId);
      const rawHoliday = holidaysByDate.get(attendance.attendanceDate);
      const holiday = rawHoliday && (
        !rawHoliday.departments || 
        rawHoliday.departments.length === 0 || 
        rawHoliday.departments.includes('TODOS') || 
        (employee?.departamentoBolivia && rawHoliday.departments.includes(employee.departamentoBolivia))
      ) ? rawHoliday : null;

      return {
        date: attendance.attendanceDate,
        employee: employee?.fullName ?? 'Funcionario',
        position: employee?.position ?? '',
        entryTime: holiday ? 'Feriado' : formatTime(attendance.entryTime),
        exitTime: holiday ? 'Feriado' : formatTime(attendance.exitTime),
        status: statusLabel(attendance.status),
        lateMinutes: `${attendance.lateMinutes} min`,
        entryObservation: attendance.entryObservation ?? '',
        exitObservation: attendance.exitObservation ?? '',
        notes: attendance.notes ?? '',
      };
    });
}

function exportAttendanceExcel(rows: Array<Record<ExportColumnKey, string>>, columns: ExportColumnKey[], month: string) {
  const html = buildExportTableHtml(rows, columns, month, false);
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `planilla-asistencia-${month}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAttendancePdf(rows: Array<Record<ExportColumnKey, string>>, columns: ExportColumnKey[], month: string) {
  const html = buildExportTableHtml(rows, columns, month, true);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function buildExportTableHtml(rows: Array<Record<ExportColumnKey, string>>, columns: ExportColumnKey[], month: string, printable: boolean) {
  const selectedColumns = EXPORT_COLUMNS.filter((column) => columns.includes(column.key));
  const monthLabel = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`));
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${selectedColumns.map((column) => `<td>${escapeHtml(row[column.key] ?? '')}</td>`).join('')}</tr>`,
    )
    .join('') || `<tr><td colspan="${selectedColumns.length}">Sin registros para el mes seleccionado</td></tr>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Planilla de asistencia ${escapeHtml(monthLabel)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 28px 36px; color: #000; }
    .logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .logos img:first-child { width: 190px; }
    .logos img:last-child { width: 160px; }
    h1, h2, h3 { margin: 4px 0; text-align: center; text-transform: uppercase; }
    h1 { font-size: 13px; text-decoration: underline; }
    h2 { font-size: 12px; text-decoration: underline; }
    h3 { font-size: 14px; margin: 12px 0 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #000; padding: 7px 6px; text-align: center; }
    td:nth-child(2), th:nth-child(2) { text-align: left; }
    .signature { width: 260px; margin: 58px auto 0; border-top: 1px solid #000; padding-top: 8px; text-align: center; font-weight: 700; }
    @media print { body { padding: 18px 24px; } ${printable ? '' : '@page { size: auto; }'} }
  </style>
</head>
<body>
  <div class="logos">
    <img src="/brand-ministry.svg" />
    <img src="/brand-oap.svg" />
  </div>
  <h1>Ministerio Desarrollo Productivo Rural y Agua</h1>
  <h2>Observatorio Agroambiental Productivo</h2>
  <h3>Planilla de asistencia del mes de ${escapeHtml(monthLabel)}</h3>
  <table>
    <thead><tr>${selectedColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="signature">Firma y sello responsable</div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    LOGIN: 'Inicio de sesion',
    REGISTER_ENTRY: 'Registro de entrada',
    REGISTER_EXIT: 'Registro de salida',
    ADMIN_CREATE_ATTENDANCE: 'Asistencia creada por administrador',
    ADMIN_UPDATE_ATTENDANCE: 'Asistencia editada por administrador',
    DELETE_ATTENDANCE: 'Asistencia eliminada',
    DELETE_ATTENDANCE_ENTRY: 'Entrada eliminada',
    DELETE_ATTENDANCE_EXIT: 'Salida eliminada',
    CREATE_EMPLOYEE: 'Funcionario creado',
    UPDATE_EMPLOYEE: 'Funcionario actualizado',
    DEACTIVATE_EMPLOYEE: 'Funcionario desactivado',
    UPDATE_CONFIGURATION: 'Configuracion actualizada',
    CREATE_HOLIDAY: 'Feriado creado',
    UPDATE_HOLIDAY: 'Feriado actualizado',
    DELETE_HOLIDAY: 'Feriado eliminado',
  };

  return labels[action] ?? action;
}

function auditValue(value: unknown) {
  if (!value || typeof value !== 'object') return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function auditTargetLabel(log: AuditLog) {
  const next = auditValue(log.newValue);
  const previous = auditValue(log.oldValue);
  const source = Object.keys(next).length > 0 ? next : previous;
  const employeeName = source.employeeName ?? source.fullName ?? source.name;
  const employeeCi = source.employeeCi ?? source.ci;
  const date = source.attendanceDate ?? source.date;

  if (employeeName && employeeCi && date) return `${employeeName} - CI ${employeeCi} - ${date}`;
  if (employeeName && employeeCi) return `${employeeName} - CI ${employeeCi}`;
  if (employeeName) return String(employeeName);
  if (employeeCi) return `CI ${employeeCi}`;
  if (date) return String(date);

  return `${log.entity} ${log.entityId}`;
}

function auditChangeSummary(log: AuditLog) {
  const next = auditValue(log.newValue);
  const previous = auditValue(log.oldValue);
  const pieces: string[] = [];

  // 1. Handle Attendances (REGISTER_ENTRY, REGISTER_EXIT, ADMIN_CREATE_ATTENDANCE, ADMIN_UPDATE_ATTENDANCE, etc.)
  if (log.entity === 'Attendance' || log.action.includes('ATTENDANCE')) {
    const status = next.status ?? previous.status;
    const entryTime = next.entryTime ?? previous.entryTime;
    const exitTime = next.exitTime ?? previous.exitTime;
    const lateMinutes = next.lateMinutes ?? previous.lateMinutes;
    const outsideArea = next.outsideArea;

    if (entryTime) pieces.push(`Entrada: ${formatTime(String(entryTime))}`);
    if (exitTime) pieces.push(`Salida: ${formatTime(String(exitTime))}`);
    if (status) pieces.push(`Estado: ${statusLabel(String(status))}`);
    if (lateMinutes !== undefined && lateMinutes !== null) pieces.push(`Retraso: ${lateMinutes} min`);
    if (outsideArea) pieces.push('Ubicación: Fuera de área');
  }
  
  // 2. Handle Employees (CREATE_EMPLOYEE, UPDATE_EMPLOYEE, DEACTIVATE_EMPLOYEE)
  else if (log.entity === 'Employee' || log.action.includes('EMPLOYEE')) {
    if (log.action === 'CREATE_EMPLOYEE') {
      pieces.push(`Creado funcionario: ${next.fullName} (CI ${next.ci}) - Cargo: ${next.position}`);
    } else if (log.action === 'DEACTIVATE_EMPLOYEE') {
      pieces.push(`Desactivado funcionario: ${previous.fullName} (CI ${previous.ci})`);
    } else if (log.action === 'UPDATE_EMPLOYEE') {
      const changes: string[] = [];
      if (next.fullName !== previous.fullName) changes.push(`Nombre: "${previous.fullName}" ➔ "${next.fullName}"`);
      if (next.ci !== previous.ci) changes.push(`CI: "${previous.ci}" ➔ "${next.ci}"`);
      if (next.position !== previous.position) changes.push(`Cargo: "${previous.position}" ➔ "${next.position}"`);
      if (next.department !== previous.department) changes.push(`Unidad: "${previous.department}" ➔ "${next.department}"`);
      if (next.departamentoBolivia !== previous.departamentoBolivia) {
        changes.push(`Depto Bolivia: "${previous.departamentoBolivia ?? 'Ninguno'}" ➔ "${next.departamentoBolivia ?? 'Ninguno'}"`);
      }
      if (next.phone !== previous.phone) changes.push(`Tel: "${previous.phone ?? ''}" ➔ "${next.phone ?? ''}"`);
      if (changes.length > 0) {
        pieces.push(`Modificado: ${changes.join(', ')}`);
      } else {
        pieces.push(`Datos de funcionario actualizados`);
      }
    }
  }

  // 3. Handle Holidays (CREATE_HOLIDAY, UPDATE_HOLIDAY, DELETE_HOLIDAY)
  else if (log.entity === 'Holiday' || log.action.includes('HOLIDAY')) {
    if (log.action === 'CREATE_HOLIDAY') {
      pieces.push(`Creado feriado: "${next.name}" para la fecha ${next.date}`);
      if (next.departments && Array.isArray(next.departments) && next.departments.length > 0) {
        pieces.push(`Departamentos: ${next.departments.join(', ')}`);
      }
    } else if (log.action === 'DELETE_HOLIDAY') {
      pieces.push(`Eliminado feriado: "${previous.name}" (${previous.date})`);
    } else if (log.action === 'UPDATE_HOLIDAY') {
      pieces.push(`Actualizado feriado: "${next.name}" (${next.date})`);
    }
  }

  // 4. Handle Institutional Config (UPDATE_CONFIGURATION)
  else if (log.entity === 'Configuration' || log.action.includes('CONFIGURATION')) {
    pieces.push(`Nueva configuración - Ingreso: ${next.entryTime}, Salida: ${next.exitTime}, Tolerancia: ${next.toleranceMinutes} min`);
  }

  // 5. Handle Login (LOGIN)
  else if (log.action === 'LOGIN') {
    pieces.push(`Sesión iniciada con éxito`);
  }

  if (pieces.length === 0 && log.reason) pieces.push(log.reason);
  if (pieces.length === 0) pieces.push('Cambio registrado');

  return pieces.join(' · ');
}

function AttendanceHistory({
  attendances,
  canManage = false,
  configuration,
  employees,
  holidays,
  onChanged,
  session,
  title,
  employee,
}: {
  attendances: Attendance[];
  canManage?: boolean;
  configuration?: Configuration | null;
  employees: Employee[];
  holidays: Holiday[];
  onChanged?: (message: string) => void;
  session?: SessionUser;
  title: string;
  employee?: Employee | SessionUser | null;
}) {
  const now = new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const monthName = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const days = buildWorkCalendarDays(visibleMonth);
  const recordsByDate = useMemo(() => {
    return attendances.reduce<Record<string, Attendance[]>>((acc, attendance) => {
      acc[attendance.attendanceDate] = [...(acc[attendance.attendanceDate] ?? []), attendance];
      return acc;
    }, {});
  }, [attendances]);

  const filteredHolidays = useMemo(() => {
    const dept = employee?.departamentoBolivia;
    if (!dept) return holidays;
    return holidays.filter((h) => {
      if (!h.departments || h.departments.length === 0 || h.departments.includes('TODOS')) {
        return true;
      }
      return h.departments.includes(dept);
    });
  }, [holidays, employee]);

  const holidaysByDate = useMemo(() => {
    return filteredHolidays.reduce<Record<string, Holiday>>((acc, holiday) => {
      acc[holiday.date] = holiday;
      return acc;
    }, {});
  }, [filteredHolidays]);

  function moveMonth(offset: number) {
    setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1));
  }

  return (
    <section className="calendar-shell">
      <aside className="calendar-side">
        <h3>{title}</h3>
        <div className="mini-month">
          <strong>{monthName}</strong>
          <span>{attendances.length} registros</span>
        </div>
        <div className="calendar-legend">
          <h4>Colores de calendario</h4>
          <span><i className="legend-ok" /> Marcado correcto</span>
          <span><i className="legend-late" /> Retraso</span>
          <span><i className="legend-missing" /> Omision</span>
          <span><i className="legend-location" /> Fuera de area</span>
          <span><i className="legend-holiday" /> Feriados</span>
          <span><i className="legend-proof" /> Presento justificativo</span>
        </div>
      </aside>

      <section className="calendar-main">
        <header className="calendar-toolbar">
          <button onClick={() => moveMonth(-1)}>‹</button>
          <h3>{monthName}</h3>
          <button onClick={() => moveMonth(1)}>›</button>
        </header>

        <div className="calendar-weekdays">
          <span>lun</span>
          <span>mar</span>
          <span>mie</span>
          <span>jue</span>
          <span>vie</span>
        </div>

        <div className="calendar-grid">
          {days.map((date) => {
            const dateKey = formatDateKey(date);
            const records = recordsByDate[dateKey] ?? [];
            const holiday = holidaysByDate[dateKey];
            const muted = date.getMonth() !== visibleMonth.getMonth();

            return (
              <article
                className={`calendar-cell ${muted ? 'muted' : ''} ${records.length || holiday || canManage ? 'has-records' : ''}`}
                key={dateKey}
                onClick={() => (records.length > 0 || holiday || canManage) && setSelectedDateKey(dateKey)}
              >
                <strong className="day-number">{date.getDate()}</strong>
                <div className="day-events">
                  {holiday && <span className="calendar-event event-holiday">{holiday.name}</span>}
                  {records.length === 0 && !holiday ? (
                    <span className="empty-day" />
                  ) : (
                    records.flatMap((attendance) => {
                      const employee = employees.find((item) => item.id === attendance.employeeId);
                      const label = employee ? employee.fullName.split(' ')[0] : 'Funcionario';
                      const hasObservation = Boolean(attendance.entryObservation || attendance.exitObservation || attendance.notes);
                      const isJustified = attendance.status === 'JUSTIFIED';
                      const recordDateStr = attendance.attendanceDate.slice(0, 10);
                      const todayObj = new Date();
                      const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
                      const isPastDay = recordDateStr < todayStr;
                      const stateOnlyEvents: Record<string, { text: string; className: string }> = {
                        ABSENT: { text: 'Omision', className: 'event-missing' },
                        HOLIDAY: { text: 'Feriado', className: 'event-holiday' },
                        PENDING: { text: 'Pendiente', className: 'event-missing' },
                      };
                      if (!attendance.entryTime && !attendance.exitTime && stateOnlyEvents[attendance.status]) {
                        const event = stateOnlyEvents[attendance.status];
                        return (
                          <span className={`calendar-event ${event.className}`} key={`${attendance.id}-state`}>
                            {event.text}
                            {employees.length > 1 ? ` - ${label}` : ''}
                            {hasObservation ? ' • obs' : ''}
                          </span>
                        );
                      }
                      const entryState = getCalendarEntryState(attendance, configuration);
                      const events = [
                        attendance.entryTime && {
                          key: `${attendance.id}-entry`,
                          text: `${formatTime(attendance.entryTime)} ${entryState.label}`,
                          className: entryState.className,
                        },
                        attendance.exitTime
                          ? {
                              key: `${attendance.id}-exit`,
                              text: `${formatTime(attendance.exitTime)} ${isJustified ? 'Justificado' : 'Normal'}`,
                              className: isJustified ? 'event-proof' : 'event-ok',
                            }
                          : {
                              key: `${attendance.id}-missing`,
                              text: isPastDay ? 'Omision' : 'Salida pendiente',
                              className: 'event-missing',
                            },
                      ].filter(Boolean) as Array<{ key: string; text: string; className: string }>;

                      return events.map((event) => (
                        <span className={`calendar-event ${event.className}`} key={event.key}>
                          {event.text}
                          {employees.length > 1 ? ` - ${label}` : ''}
                          {hasObservation ? ' • obs' : ''}
                        </span>
                      ));
                    })
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {selectedDateKey && (
        <AttendanceDayModal
          dateKey={selectedDateKey}
          employees={employees}
          configuration={configuration}
          records={recordsByDate[selectedDateKey] ?? []}
          holiday={holidaysByDate[selectedDateKey]}
          onClose={() => setSelectedDateKey(null)}
          canManage={canManage}
          session={session}
          onChanged={onChanged}
          targetEmployee={employee}
        />
      )}
    </section>
  );
}

function AttendanceDayModal({
  canManage = false,
  configuration,
  dateKey,
  employees,
  holiday,
  onChanged,
  onClose,
  records,
  session,
  targetEmployee,
}: {
  canManage?: boolean;
  configuration?: Configuration | null;
  dateKey: string;
  employees: Employee[];
  holiday?: Holiday;
  onChanged?: (message: string) => void;
  onClose: () => void;
  records: Attendance[];
  session?: SessionUser;
  targetEmployee?: Employee | SessionUser | null;
}) {
  const [expandedPhoto, setExpandedPhoto] = useState<{ label: string; src: string } | null>(null);
  
  const filteredRecords = targetEmployee
    ? records.filter((r) => r.employeeId === targetEmployee.id)
    : records;

  return (
    <div className="detail-backdrop">
      <section className="day-detail-modal">
        <header className="detail-header">
          <div>
            <p>Detalle de asistencia</p>
            <h3>{dateKey}</h3>
          </div>
          <button onClick={onClose}>Cerrar</button>
        </header>

        {holiday && (
          <p className="attendance-note">
            Feriado: {holiday.name}
            {holiday.description ? ` - ${holiday.description}` : ''}
          </p>
        )}

        <div className="detail-records">
          {filteredRecords.map((attendance) => {
            const employee = employees.find((item) => item.id === attendance.employeeId);

            return (
              <article className="detail-record" key={attendance.id}>
                <div className="detail-person">
                  <strong>{employee?.fullName ?? 'Funcionario'}</strong>
                  <span>{employee?.position ?? ''}</span>
                </div>
                <MarkDetail
                  label="Entrada"
                  location={attendance.entryLocation}
                  observation={attendance.entryObservation}
                  photo={attendance.entryPhotoDataUrl}
                  time={attendance.entryTime}
                  onExpandPhoto={(label, src) => setExpandedPhoto({ label, src })}
                />
                <MarkDetail
                  label="Salida"
                  location={attendance.exitLocation}
                  observation={attendance.exitObservation}
                  photo={attendance.exitPhotoDataUrl}
                  time={attendance.exitTime}
                  onExpandPhoto={(label, src) => setExpandedPhoto({ label, src })}
                />
                {attendance.notes && <p className="attendance-note">{attendance.notes}</p>}
                {attendance.justificationNote && (
                  <p className="attendance-note">Justificativo: {attendance.justificationNote}</p>
                )}
                {canManage && onChanged && (
                  <div className="row-actions">
                    <button onClick={() => deleteMark(attendance.id, 'entry', onChanged, session)}>Eliminar entrada</button>
                    <button onClick={() => deleteMark(attendance.id, 'exit', onChanged, session)}>Eliminar salida</button>
                    <button onClick={() => deleteMark(attendance.id, 'all', onChanged, session)}>Eliminar registro</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {canManage && onChanged && (
          <AdminAttendanceEditor
            configuration={configuration}
            dateKey={dateKey}
            employees={employees}
            records={filteredRecords}
            onChanged={onChanged}
            session={session}
            targetEmployee={targetEmployee}
          />
        )}
      </section>

      {expandedPhoto && (
        <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Foto ampliada de ${expandedPhoto.label}`}>
          <div className="photo-viewer-panel">
            <header>
              <strong>Foto de {expandedPhoto.label.toLowerCase()}</strong>
              <button onClick={() => setExpandedPhoto(null)}>Cerrar</button>
            </header>
            <img src={expandedPhoto.src} alt={`Foto ampliada de ${expandedPhoto.label.toLowerCase()}`} />
          </div>
        </div>
      )}
    </div>
  );
}

function timeInputValue(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function deleteMark(id: string, type: 'entry' | 'exit' | 'all', onChanged: (message: string) => void, session?: SessionUser) {
  const response = await fetch(`${API_URL}/attendances/${id}/${type}`, { method: 'DELETE', headers: authHeaders(session) });
  const body = await response.json();
  onChanged(body.message ?? 'Marcado actualizado.');
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function getAutomaticAttendancePreview(
  entryTime: string,
  status: string,
  configuration?: Configuration | null,
) {
  if (status === 'JUSTIFIED') {
    return {
      title: 'Presento justificativo',
      detail: 'Se contara como dia valido, sin depender del retraso automatico.',
      tone: 'proof',
    };
  }

  if (status === 'ABSENT') {
    return { title: 'Omision', detail: 'Se guardara como dia no marcado correctamente.', tone: 'missing' };
  }

  if (status === 'HOLIDAY') {
    return { title: 'Feriado', detail: 'Se guardara como dia feriado para este funcionario.', tone: 'holiday' };
  }

  if (status === 'PENDING') {
    return { title: 'Pendiente', detail: 'Quedara pendiente de revision administrativa.', tone: 'info' };
  }

  if (!entryTime) {
    return { title: 'Pendiente', detail: 'Sin hora de entrada, el sistema no puede calcular retraso.', tone: 'info' };
  }

  if (!configuration) {
    return { title: 'Calculo no disponible', detail: 'No se cargo la configuracion de horario.', tone: 'info' };
  }

  const lateMinutes = Math.max(0, minutesFromTime(entryTime) - minutesFromTime(configuration.entryTime) - configuration.toleranceMinutes);

  if (lateMinutes > 0) {
    return {
      title: 'Se guardara como retraso',
      detail: `${lateMinutes} min tarde. Ingreso esperado ${configuration.entryTime}, tolerancia ${configuration.toleranceMinutes} min.`,
      tone: 'late',
    };
  }

  return {
    title: 'Se guardara como presente',
    detail: `Entrada dentro del horario. Ingreso esperado ${configuration.entryTime}, tolerancia ${configuration.toleranceMinutes} min.`,
    tone: 'ok',
  };
}

function getCalendarEntryState(attendance: Attendance, configuration?: Configuration | null) {
  const isOutsideArea = hasOutsideAreaNote(attendance);
  if (attendance.status === 'JUSTIFIED') {
    return {
      label: isOutsideArea ? 'Justificado + fuera de area' : 'Justificado',
      className: `event-proof${isOutsideArea ? ' event-location-split' : ''}`,
    };
  }

  if (!attendance.entryTime) {
    return {
      label: isOutsideArea ? 'Pendiente + fuera de area' : 'Pendiente',
      className: `event-missing${isOutsideArea ? ' event-location-split' : ''}`,
    };
  }

  const entryTime = timeInputValue(attendance.entryTime);
  const attendanceConfiguration = attendance.configuration ?? configuration;
  const calculatedLateMinutes =
    entryTime && attendanceConfiguration
      ? Math.max(
          0,
          minutesFromTime(entryTime) -
            minutesFromTime(attendanceConfiguration.entryTime) -
            attendanceConfiguration.toleranceMinutes,
        )
      : attendance.lateMinutes;

  if (calculatedLateMinutes > 0) {
    return {
      label: isOutsideArea ? 'Retraso + fuera de area' : 'Retraso',
      className: `event-late${isOutsideArea ? ' event-location-split' : ''}`,
    };
  }

  return {
    label: isOutsideArea ? 'Normal + fuera de area' : 'Normal',
    className: `event-ok${isOutsideArea ? ' event-location-split' : ''}`,
  };
}

function AdminAttendanceEditor({
  configuration,
  dateKey,
  employees,
  onChanged,
  records,
  session,
  targetEmployee,
}: {
  configuration?: Configuration | null;
  dateKey: string;
  employees: Employee[];
  onChanged: (message: string) => void;
  records: Attendance[];
  session?: SessionUser;
  targetEmployee?: Employee | SessionUser | null;
}) {
  const activeEmployees = employees.filter((employee) => employee.status === 'ACTIVE');
  const [employeeId, setEmployeeId] = useState(
    targetEmployee?.id ?? records[0]?.employeeId ?? activeEmployees[0]?.id ?? employees[0]?.id ?? ''
  );
  const selectedRecord = records.find((record) => record.employeeId === employeeId);
  const [form, setForm] = useState({
    entryTime: '',
    exitTime: '',
    status: 'AUTO',
    notes: '',
    entryObservation: '',
    exitObservation: '',
    justificationNote: '',
  });
  const automaticPreview = getAutomaticAttendancePreview(form.entryTime, form.status, configuration);

  useEffect(() => {
    const status = selectedRecord?.status && ['PRESENT', 'LATE'].includes(selectedRecord.status) ? 'AUTO' : selectedRecord?.status ?? 'AUTO';
    setForm({
      entryTime: timeInputValue(selectedRecord?.entryTime ?? null),
      exitTime: timeInputValue(selectedRecord?.exitTime ?? null),
      status,
      notes: selectedRecord?.notes ?? '',
      entryObservation: selectedRecord?.entryObservation ?? '',
      exitObservation: selectedRecord?.exitObservation ?? '',
      justificationNote: selectedRecord?.justificationNote ?? '',
    });
  }, [selectedRecord?.id, employeeId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/attendances/admin`, {
      method: 'PUT',
      headers: authHeaders(session, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        employeeId,
        attendanceDate: dateKey,
        entryTime: form.entryTime || null,
        exitTime: form.exitTime || null,
        status: form.status,
        notes: form.notes || null,
        entryObservation: form.entryObservation || null,
        exitObservation: form.exitObservation || null,
        justificationNote: form.justificationNote || null,
      }),
    });
    const body = await response.json();
    onChanged(body.message ?? 'Marcado guardado.');
  }

  return (
    <form className="admin-attendance-form" onSubmit={save}>
      <h4>Editar o agregar marcado</h4>
      <p className="admin-form-help">
        Para marcados normales usa Automatico. El sistema decide Presente o Retraso segun la hora de ingreso configurada.
        Usa los otros modos solo para casos administrativos especiales.
      </p>
      {targetEmployee ? (
        <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', fontWeight: '800', fontSize: '13.5px', color: '#334155', border: '1px solid #e2e8f0', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Funcionario:</span>
          <strong style={{ color: '#0f766e' }}>{targetEmployee.fullName}</strong>
        </div>
      ) : (
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          {activeEmployees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
      )}
      <input type="time" value={form.entryTime} onChange={(event) => setForm({ ...form, entryTime: event.target.value })} />
      <input type="time" value={form.exitTime} onChange={(event) => setForm({ ...form, exitTime: event.target.value })} />
      <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        <option value="AUTO">Automatico: Presente o retraso</option>
        <option value="ABSENT">Omision</option>
        <option value="JUSTIFIED">Presento justificativo</option>
        <option value="HOLIDAY">Feriado</option>
        <option value="PENDING">Pendiente</option>
      </select>
      <div className={`auto-late-note ${automaticPreview.tone}`}>
        <strong>{automaticPreview.title}</strong>
        <span>{automaticPreview.detail}</span>
      </div>
      <textarea placeholder="Observacion de entrada" value={form.entryObservation} onChange={(event) => setForm({ ...form, entryObservation: event.target.value })} />
      <textarea placeholder="Observacion de salida" value={form.exitObservation} onChange={(event) => setForm({ ...form, exitObservation: event.target.value })} />
      <textarea placeholder="Justificativo presentado" value={form.justificationNote} onChange={(event) => setForm({ ...form, justificationNote: event.target.value })} />
      <textarea placeholder="Observacion interna" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      <button className="primary-action">Guardar marcado</button>
    </form>
  );
}

function MarkDetail({
  label,
  location,
  onExpandPhoto,
  observation,
  photo,
  time,
}: {
  label: string;
  location?: GeoPoint;
  onExpandPhoto?: (label: string, src: string) => void;
  observation?: string | null;
  photo?: string | null;
  time: string | null;
}) {
  const mapUrl = location
    ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    : '';
  const photoSrc = photo ? assetUrl(photo) : '';

  return (
    <div className="mark-detail">
      <div>
        <span>{label}</span>
        <strong>{formatTime(time)}</strong>
        {location ? (
          <a href={mapUrl} rel="noreferrer" target="_blank">
            Ver ubicacion ({location.accuracy ? `${Math.round(location.accuracy)} m` : 'GPS'})
          </a>
        ) : (
          <small>Sin ubicacion</small>
        )}
        {observation && <small className="mark-observation">Obs: {observation}</small>}
      </div>
      {photoSrc ? (
        <button className="mark-photo-button" type="button" onClick={() => onExpandPhoto?.(label, photoSrc)} aria-label={`Ampliar foto de ${label.toLowerCase()}`}>
          <img src={photoSrc} alt={`Foto de ${label.toLowerCase()}`} />
          <span>Ampliar</span>
        </button>
      ) : (
        <div className="no-photo">Sin foto</div>
      )}
    </div>
  );
}

function buildWorkCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);

  const days: Date[] = [];
  const cursor = new Date(start);

  while (days.length < 30) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
