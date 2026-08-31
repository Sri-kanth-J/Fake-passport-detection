import { useState } from 'react'
import {
  Badge, Button, Card, Col, Container,
  ProgressBar, Row, Spinner,
} from 'react-bootstrap'
import './App.css'

// Clean passport — mirrors the real backend response shape
const PASSPORT_MOCK = {
  document_classification: { type: 'Passport', confidence: 0.98 },
  ocr: {
    type: 'Passport',
    mrz_valid: true,
    extracted_fields: {
      document_number: 'J8942301',
      nationality: 'IND',
      dob: '880415',
      expiry: '280414',
      sex: 'M',
    },
  },
  tamper_detection: {
    is_tampered: false,
    confidence: 0.93,
    details: 'Deep Learning ELA analysis cleared the document.',
  },
  face_verification: {
    '1_to_1_match': true,
    '1_to_1_confidence': 0.97,
    '1_to_n_flagged': false,
  },
  risk_score: { score: 5, risk_level: 'LOW', recommendation: 'APPROVE' },
}

// High-risk tampered passport for the demo toggle
const TAMPERED_MOCK = {
  document_classification: { type: 'Passport', confidence: 0.91 },
  ocr: {
    type: 'Passport',
    mrz_valid: false,
    extracted_fields: {
      document_number: 'X1111111',
      nationality: 'NPL',
      dob: '900101',
      expiry: '220101',
      sex: 'M',
    },
  },
  tamper_detection: {
    is_tampered: true,
    confidence: 0.88,
    details: 'Photo splicing detected via ELA. MRZ checksum mismatch.',
  },
  face_verification: {
    '1_to_1_match': false,
    '1_to_1_confidence': 0.31,
    '1_to_n_flagged': true,
  },
  risk_score: { score: 87, risk_level: 'HIGH', recommendation: 'DETAIN & INVESTIGATE' },
}

// Analysis pipeline labels shown step by step during loading
const STAGES = [
  'Classifying document type...',
  'Running OCR & MRZ extraction...',
  'Running ELA tamper detection...',
  'Performing face verification...',
  'Computing fusion risk score...',
]

// Maps risk level string to a Bootstrap color variant
const RISK_VARIANT = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' }

// SVG semi-circle gauge — no external charting library needed
function RiskGauge({ score, level }) {
  const angle = (score / 100) * 180
  const rad   = (angle - 90) * (Math.PI / 180)
  const r = 80, cx = 100, cy = 100
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const colorMap = { LOW: '#198754', MEDIUM: '#ffc107', HIGH: '#dc3545' }
  const color = colorMap[level] || '#198754'

  return (
    <svg viewBox="0 0 200 110" width="160">
      <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="#dee2e6" strokeWidth="14" strokeLinecap="round" />
      <path
        d={`M20,100 A80,80 0 ${angle > 90 ? 1 : 0},1 ${x.toFixed(1)},${y.toFixed(1)}`}
        fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
      />
      <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="6" fill={color} />
      <text x="100" y="88" textAnchor="middle" fontSize="26" fontWeight="800" fill={color}>{score}</text>
      <text x="100" y="104" textAnchor="middle" fontSize="11" fill="#6c757d">/ 100</text>
    </svg>
  )
}

// Formats YYMMDD MRZ date to DD/MM/YYYY
function fmtDate(d) {
  if (!d || d.length < 6) return d
  const yy = parseInt(d.slice(0, 2))
  return `${d.slice(4, 6)}/${d.slice(2, 4)}/${yy > 30 ? 1900 + yy : 2000 + yy}`
}

const MRZ_LABELS = {
  document_number: 'Document No.',
  nationality: 'Nationality',
  dob: 'Date of Birth',
  expiry: 'Expiry Date',
  sex: 'Sex',
}

// One row in the checks summary — green tick or red cross
function CheckRow({ label, pass, value }) {
  return (
    <div className="d-flex align-items-center gap-2 py-2 border-bottom border-secondary-subtle">
      <span className={`fw-bold fs-5 ${pass ? 'text-success' : 'text-danger'}`}>
        {pass ? '✓' : '✗'}
      </span>
      <span className="flex-grow-1 text-secondary small">{label}</span>
      <Badge bg={pass ? 'success' : 'danger'} className="text-uppercase">{value}</Badge>
    </div>
  )
}

export default function App() {
  const [file,       setFile]       = useState(null)
  const [preview,    setPreview]    = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [stageIdx,   setStageIdx]   = useState(0)
  const [results,    setResults]    = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [demoMode,   setDemoMode]   = useState('clear')  // 'clear' | 'tampered'

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0])
  }
  const pickFile = (f) => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResults(null)
  }

  // Steps through stage labels at 700 ms each then resolves
  const animateStages = () => new Promise((res) => {
    let i = 0
    const tick = () => {
      setStageIdx(i); i++
      if (i < STAGES.length) setTimeout(tick, 700)
      else setTimeout(res, 500)
    }
    tick()
  })

  const runAnalysis = async () => {
    if (!file) return
    setLoading(true); setResults(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('http://localhost:8000/api/verify-document', { method: 'POST', body: form })
      if (!res.ok) throw new Error()
      const data = await res.json()
      await animateStages()
      setResults(data.results)
    } catch {
      // Backend offline — fall back to selected demo mock
      await animateStages()
      setResults(demoMode === 'tampered' ? TAMPERED_MOCK : PASSPORT_MOCK)
    }
    setLoading(false)
  }

  const r  = results
  const rv = r ? RISK_VARIANT[r.risk_score.risk_level] : 'secondary'

  return (
    <div className="app-shell">

      {/* Top navbar */}
      <nav className="navbar navbar-dark bg-dark border-bottom border-secondary px-4 py-2">
        <span className="navbar-brand fw-bold fs-5 mb-0">
          <span className="text-info">SSB</span> Passport Verification
        </span>
        <span className="text-secondary small">BOP Terminal 42 · ICAO TD-3</span>
      </nav>

      <Container fluid className="py-4 px-4">
        <Row className="g-4">

          {/* Left column: upload + controls */}
          <Col xs={12} lg={4}>

            {/* Demo scenario switcher */}
            <Card className="border-secondary mb-3 bg-dark-subtle">
              <Card.Body className="py-2 px-3">
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <span className="text-secondary small fw-semibold">Demo scenario:</span>
                  <div className="btn-group btn-group-sm">
                    <Button
                      variant={demoMode === 'clear' ? 'success' : 'outline-success'}
                      onClick={() => { setDemoMode('clear'); setResults(null) }}
                    >Clear</Button>
                    <Button
                      variant={demoMode === 'tampered' ? 'danger' : 'outline-danger'}
                      onClick={() => { setDemoMode('tampered'); setResults(null) }}
                    >Tampered</Button>
                  </div>
                </div>
              </Card.Body>
            </Card>

            {/* Upload card */}
            <Card className="border-secondary">
              <Card.Header className="bg-transparent border-secondary">
                <Card.Title className="mb-0 fs-6 fw-semibold">Document Capture</Card.Title>
                <p className="text-secondary small mb-0">Upload or drag in a passport scan</p>
              </Card.Header>
              <Card.Body>

                {/* Dropzone */}
                <div
                  className={`drop-zone rounded-3 ${dragActive ? 'drop-zone-active' : ''}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag}
                  onDragOver={handleDrag} onDrop={handleDrop}
                >
                  <input
                    type="file" accept="image/*" className="drop-zone-input"
                    onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
                  />
                  {preview
                    ? <img src={preview} alt="Passport preview" className="img-fluid rounded" />
                    : (
                      <div className="text-center text-secondary py-4">
                        <div style={{ fontSize: '2.5rem' }}>⎘</div>
                        <div className="fw-semibold">Drag & drop or click</div>
                        <div className="small">PNG · JPG · Max 10 MB</div>
                      </div>
                    )
                  }
                </div>

                {/* File name chip */}
                {file && (
                  <div className="d-flex align-items-center gap-2 mt-2 p-2 rounded bg-secondary-subtle">
                    <span>📄</span>
                    <span className="small text-truncate flex-grow-1">{file.name}</span>
                    <Badge bg="secondary">{(file.size / 1024).toFixed(1)} KB</Badge>
                  </div>
                )}

                <Button
                  variant="info" className="w-100 mt-3 fw-semibold text-dark"
                  onClick={runAnalysis} disabled={!file || loading}
                >
                  {loading
                    ? <><Spinner size="sm" className="me-2" />{STAGES[stageIdx]}</>
                    : 'Run Passport Analysis'
                  }
                </Button>

                {/* Stage progress dots */}
                {loading && (
                  <div className="d-flex justify-content-center gap-2 mt-2">
                    {STAGES.map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-circle stage-dot ${i <= stageIdx ? 'bg-info' : 'bg-secondary'}`}
                      />
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Hint card */}
            <Card className="border-secondary mt-3 bg-dark-subtle">
              <Card.Body className="py-2 px-3">
                <p className="small text-secondary mb-0">
                  <strong className="text-info">No file?</strong> Pick a scenario above and click{' '}
                  <em>Run Passport Analysis</em> with any image to see instant mocked results.
                </p>
              </Card.Body>
            </Card>
          </Col>

          {/* Right column: results */}
          <Col xs={12} lg={8}>
            <Card className="border-secondary h-100">
              <Card.Header className="bg-transparent border-secondary">
                <Card.Title className="mb-0 fs-6 fw-semibold">Verification Report</Card.Title>
              </Card.Header>
              <Card.Body>

                {/* Empty state */}
                {!r && !loading && (
                  <div className="d-flex flex-column align-items-center justify-content-center text-secondary py-5 gap-2">
                    <span style={{ fontSize: '3rem' }}>🛂</span>
                    <p className="mb-0">Upload a passport and run analysis to see results</p>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="d-flex flex-column align-items-center justify-content-center py-5 gap-3">
                    <Spinner variant="info" style={{ width: '3rem', height: '3rem' }} />
                    <p className="text-info mb-0">{STAGES[stageIdx]}</p>
                  </div>
                )}

                {/* Full results */}
                {r && !loading && (
                  <div className="d-flex flex-column gap-4">

                    {/* Risk score banner */}
                    <Card className={`border-${rv} bg-${rv} bg-opacity-10`}>
                      <Card.Body className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                        <div>
                          <div className="text-secondary small">Fusion Risk Score</div>
                          <div className={`fs-4 fw-bold text-${rv}`}>{r.risk_score.recommendation}</div>
                          <Badge bg={rv} className="mt-1 text-uppercase">{r.risk_score.risk_level} RISK</Badge>
                        </div>
                        <RiskGauge score={r.risk_score.score} level={r.risk_score.risk_level} />
                      </Card.Body>
                    </Card>

                    {/* MRZ data fields */}
                    <Card className="border-secondary">
                      <Card.Header className="bg-transparent border-secondary d-flex justify-content-between align-items-center">
                        <span className="fw-semibold small">Machine Readable Zone (MRZ)</span>
                        <Badge bg={r.ocr.mrz_valid ? 'success' : 'danger'}>
                          {r.ocr.mrz_valid ? 'VALID CHECKSUM' : 'MRZ INVALID'}
                        </Badge>
                      </Card.Header>
                      <Card.Body>
                        <Row xs={2} md={3} className="g-2">
                          {Object.entries(r.ocr.extracted_fields).map(([k, v]) => (
                            <Col key={k}>
                              <div className="bg-secondary-subtle rounded p-2">
                                <div className="text-secondary" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {MRZ_LABELS[k] || k}
                                </div>
                                <div className="fw-semibold small">
                                  {k === 'dob' || k === 'expiry' ? fmtDate(v) : v}
                                </div>
                              </div>
                            </Col>
                          ))}
                        </Row>
                      </Card.Body>
                    </Card>

                    {/* ELA + CNN tamper detection with progress bar */}
                    <Card className="border-secondary">
                      <Card.Header className="bg-transparent border-secondary d-flex justify-content-between align-items-center">
                        <span className="fw-semibold small">Tamper Detection (ELA + CNN)</span>
                        <Badge bg={r.tamper_detection.is_tampered ? 'danger' : 'success'}>
                          {r.tamper_detection.is_tampered ? 'TAMPERED' : 'GENUINE'}
                        </Badge>
                      </Card.Header>
                      <Card.Body>
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <span className="text-secondary small">Model confidence</span>
                          <span className="fw-semibold small ms-auto">
                            {(r.tamper_detection.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <ProgressBar
                          variant={r.tamper_detection.is_tampered ? 'danger' : 'success'}
                          now={r.tamper_detection.confidence * 100}
                          className="mb-2"
                          style={{ height: '8px' }}
                        />
                        <p className="text-secondary small mb-0">{r.tamper_detection.details}</p>
                      </Card.Body>
                    </Card>

                    {/* Face 1:1 liveness and 1:N watchlist */}
                    <Card className="border-secondary">
                      <Card.Header className="bg-transparent border-secondary d-flex justify-content-between align-items-center">
                        <span className="fw-semibold small">Face Verification</span>
                        <Badge bg={r.face_verification['1_to_n_flagged'] ? 'danger' : 'success'}>
                          {r.face_verification['1_to_n_flagged'] ? 'WATCHLIST HIT' : 'CLEAR'}
                        </Badge>
                      </Card.Header>
                      <Card.Body className="pb-1">
                        <CheckRow
                          label="1:1 Liveness match"
                          pass={r.face_verification['1_to_1_match']}
                          value={`${(r.face_verification['1_to_1_confidence'] * 100).toFixed(1)}% similarity`}
                        />
                        <CheckRow
                          label="1:N Watchlist search"
                          pass={!r.face_verification['1_to_n_flagged']}
                          value={r.face_verification['1_to_n_flagged'] ? 'Match in DB' : 'No records'}
                        />
                      </Card.Body>
                    </Card>

                    {/* Automated checks summary */}
                    <Card className="border-secondary">
                      <Card.Header className="bg-transparent border-secondary">
                        <span className="fw-semibold small">Automated Checks Summary</span>
                      </Card.Header>
                      <Card.Body className="pb-1">
                        <CheckRow label="Document classified as Passport"  pass={r.document_classification.type === 'Passport'}  value={r.document_classification.type} />
                        <CheckRow label="MRZ TD-3 checksum"               pass={r.ocr.mrz_valid}                                 value={r.ocr.mrz_valid ? 'Pass' : 'Fail'} />
                        <CheckRow label="Photo not tampered"               pass={!r.tamper_detection.is_tampered}                 value={!r.tamper_detection.is_tampered ? 'Pass' : 'Fail'} />
                        <CheckRow label="Face 1:1 verified"                pass={r.face_verification['1_to_1_match']}             value={r.face_verification['1_to_1_match'] ? 'Pass' : 'Fail'} />
                        <CheckRow label="Not on watchlist"                 pass={!r.face_verification['1_to_n_flagged']}          value={!r.face_verification['1_to_n_flagged'] ? 'Pass' : 'Flagged'} />
                      </Card.Body>
                    </Card>

                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

        </Row>
      </Container>
    </div>
  )
}

