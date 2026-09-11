import { createHash, randomUUID } from "node:crypto";

const MRZ_LINE_LENGTH = 44;
const TEST_DATA_NOTICE = "Synthetic demo data only — not a real travel-document verification service.";

function checkDigit(value) {
  const weights = [7, 3, 1];
  const total = [...value].reduce((sum, character, index) => {
    let characterValue = 0;
    if (/\d/.test(character)) characterValue = Number(character);
    if (/[A-Z]/.test(character)) characterValue = character.charCodeAt(0) - 55;
    return sum + characterValue * weights[index % weights.length];
  }, 0);
  return String(total % 10);
}

function normalizeMrzLine(value) {
  const line = String(value || "").toUpperCase().replace(/\s/g, "");
  if (line.length !== MRZ_LINE_LENGTH) {
    throw new Error(`Each TD3 MRZ line must contain exactly ${MRZ_LINE_LENGTH} characters.`);
  }
  if (!/^[A-Z0-9<]+$/.test(line)) {
    throw new Error("MRZ lines may contain only A–Z, 0–9, and < characters.");
  }
  return line;
}

function parseMrzDate(value, kind = "birth") {
  if (!/^\d{6}$/.test(value)) return null;
  const yearFragment = Number(value.slice(0, 2));
  const currentYear = new Date().getUTCFullYear();
  let year = 2000 + yearFragment;
  // A birth date may be in the previous century; an expiry date in this demo
  // uses the current century so future fixtures are not mistaken for 19xx.
  if (kind === "birth" && year > currentYear) year -= 100;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function formatMrzName(value) {
  const [surname = "", givenNames = ""] = value.split("<<", 2);
  return [givenNames, surname]
    .join(" ")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function canonicalText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function maskValue(value, visibleCharacters = 3) {
  const stringValue = String(value || "");
  if (stringValue.length <= visibleCharacters) return "•".repeat(stringValue.length);
  return `${"•".repeat(Math.max(3, stringValue.length - visibleCharacters))}${stringValue.slice(-visibleCharacters)}`;
}

function check(id, label, actual, expected, evidence) {
  return {
    id,
    label,
    status: actual === expected ? "PASS" : "FAIL",
    severity: actual === expected ? "info" : "review",
    evidence
  };
}

export function parseTd3Mrz(line1Input, line2Input) {
  const line1 = normalizeMrzLine(line1Input);
  const line2 = normalizeMrzLine(line2Input);

  const documentNumber = line2.slice(0, 9);
  const birthDateMrz = line2.slice(13, 19);
  const expiryDateMrz = line2.slice(21, 27);
  const optionalData = line2.slice(28, 42);
  const checks = [
    check("mrz.document_number_check", "Document-number checksum", checkDigit(documentNumber), line2[9], "TD3 MRZ check digit"),
    check("mrz.birth_date_check", "Date-of-birth checksum", checkDigit(birthDateMrz), line2[19], "TD3 MRZ check digit"),
    check("mrz.expiry_date_check", "Expiry-date checksum", checkDigit(expiryDateMrz), line2[27], "TD3 MRZ check digit"),
    check("mrz.optional_data_check", "Optional-data checksum", checkDigit(optionalData), line2[42], "TD3 MRZ check digit"),
    check(
      "mrz.composite_check",
      "Composite checksum",
      checkDigit(`${line2.slice(0, 10)}${line2.slice(13, 20)}${line2.slice(21, 43)}`),
      line2[43],
      "TD3 MRZ composite check digit"
    )
  ];

  return {
    raw: { line1, line2 },
    checks,
    fields: {
      documentType: line1.slice(0, 2),
      issuingCountry: line1.slice(2, 5).replace(/</g, ""),
      name: formatMrzName(line1.slice(5)),
      documentNumber: documentNumber.replace(/</g, ""),
      nationality: line2.slice(10, 13).replace(/</g, ""),
      dateOfBirth: parseMrzDate(birthDateMrz, "birth"),
      sex: line2[20] === "<" ? "Unspecified" : line2[20],
      dateOfExpiry: parseMrzDate(expiryDateMrz, "expiry")
    }
  };
}

function buildTd3Line1({ issuer, surname, givenNames }) {
  const nameSegment = `${surname.toUpperCase()}<<${givenNames.toUpperCase().replace(/\s+/g, "<")}`;
  return `P<${issuer}${nameSegment.padEnd(39, "<").slice(0, 39)}`;
}

function buildTd3Line2({ documentNumber, nationality, dateOfBirth, sex, dateOfExpiry, optionalData = "" }) {
  const documentNumberSegment = documentNumber.toUpperCase().padEnd(9, "<").slice(0, 9);
  const birthSegment = dateOfBirth.replaceAll("-", "").slice(2);
  const expirySegment = dateOfExpiry.replaceAll("-", "").slice(2);
  const optionalSegment = optionalData.toUpperCase().replace(/[^A-Z0-9<]/g, "<").padEnd(14, "<").slice(0, 14);
  const core = `${documentNumberSegment}${checkDigit(documentNumberSegment)}${nationality}${birthSegment}${checkDigit(birthSegment)}${sex}${expirySegment}${checkDigit(expirySegment)}${optionalSegment}`;
  return `${core}${checkDigit(optionalSegment)}${checkDigit(`${core.slice(0, 10)}${core.slice(13, 20)}${core.slice(21)}${checkDigit(optionalSegment)}`)}`;
}

function createDemoScenario({ id, title, description, visibleFields, signals = [] }) {
  const mrzLine1 = buildTd3Line1({ issuer: "UTO", surname: "DOE", givenNames: "JORDAN" });
  const mrzLine2 = buildTd3Line2({
    documentNumber: "XK0000001",
    nationality: "UTO",
    dateOfBirth: "1990-01-01",
    sex: "X",
    dateOfExpiry: "2034-01-01",
    optionalData: "DEMO<ONLY"
  });
  return { id, title, description, mrzLine1, mrzLine2, visibleFields, signals };
}

const demoScenarios = [
  createDemoScenario({
    id: "clean",
    title: "Clean fictional passport",
    description: "All synthetic printed fields agree with a valid TD3 MRZ.",
    visibleFields: {
      name: "Jordan Doe",
      documentNumber: "XK0000001",
      dateOfBirth: "1990-01-01",
      dateOfExpiry: "2034-01-01"
    }
  }),
  createDemoScenario({
    id: "dob-mismatch",
    title: "Printed DOB mismatch",
    description: "The displayed date of birth conflicts with the checksum-valid MRZ.",
    visibleFields: {
      name: "Jordan Doe",
      documentNumber: "XK0000001",
      dateOfBirth: "1990-01-02",
      dateOfExpiry: "2034-01-01"
    }
  }),
  createDemoScenario({
    id: "image-anomaly",
    title: "Simulated visual anomaly",
    description: "A fictional fixture contributes two explicitly simulated anomaly indicators.",
    visibleFields: {
      name: "Jordan Doe",
      documentNumber: "XK0000001",
      dateOfBirth: "1990-01-01",
      dateOfExpiry: "2034-01-01"
    },
    signals: [
      {
        id: "demo.photo_region_inconsistency",
        label: "Simulated photo-region inconsistency",
        confidence: "demo-only",
        evidence: "Fixture-provided signal; no image analysis was run."
      },
      {
        id: "demo.text_region_anomaly",
        label: "Simulated text-region anomaly",
        confidence: "demo-only",
        evidence: "Fixture-provided signal; no image analysis was run."
      }
    ]
  })
];

function getScenario(id) {
  return demoScenarios.find((scenario) => scenario.id === id);
}

export function listDemoScenarios() {
  return demoScenarios.map(({ id, title, description, mrzLine1, mrzLine2, visibleFields }) => ({
    id,
    title,
    description,
    mrzLine1,
    mrzLine2,
    visibleFields
  }));
}

function invalidMrzResult(errorMessage) {
  const reasons = ["MRZ_INPUT_INVALID"];
  return {
    screeningId: randomUUID(),
    notice: TEST_DATA_NOTICE,
    triage: "RETAKE_IMAGE",
    reasonCodes: reasons,
    analysisAxes: {
      captureQuality: { status: "RETAKE", detail: "The provided MRZ is structurally unusable for this demo." },
      dataConsistency: { status: "NOT_ASSESSED", detail: "Checks require two valid-length TD3 MRZ lines." },
      imageAnomaly: { status: "NOT_ASSESSED", detail: "Image analysis is not enabled in this starter." },
      identityComparison: { status: "UNAVAILABLE", detail: "No face comparison or identification is performed." }
    },
    fields: [],
    checks: [{ id: "mrz.structure", label: "TD3 MRZ structure", status: "FAIL", severity: "retake", evidence: errorMessage }],
    signals: [],
    auditDigest: createAuditDigest("manual-test", "RETAKE_IMAGE", reasons, ["mrz.structure:FAIL"], [])
  };
}

let previousBlockHash = "0000000000000000000000000000000000000000000000000000000000000000";

function createAuditDigest(inputMode, triage, reasonCodes, checkStates, signalIds) {
  const nonIdentifyingEvent = {
    schema: "screening-result-v0.2",
    timestamp: new Date().toISOString(),
    previousHash: previousBlockHash,
    inputMode,
    triage,
    reasonCodes: [...reasonCodes].sort(),
    checkStates: [...checkStates].sort(),
    signalIds: [...signalIds].sort()
  };
  const currentHash = createHash("sha256").update(JSON.stringify(nonIdentifyingEvent)).digest("hex");
  previousBlockHash = currentHash;
  return currentHash;
}

function fieldAgreementCheck(id, label, mrzValue, visibleValue) {
  if (!visibleValue) {
    return { id, label, status: "NOT_ASSESSED", severity: "info", evidence: "No synthetic visible field supplied." };
  }
  const matches = canonicalText(mrzValue) === canonicalText(visibleValue);
  return {
    id,
    label,
    status: matches ? "PASS" : "FAIL",
    severity: matches ? "info" : "review",
    evidence: matches ? "Synthetic printed field agrees with MRZ." : "Synthetic printed field conflicts with MRZ."
  };
}

function expiryCheck(dateOfExpiry) {
  if (!dateOfExpiry) {
    return { id: "rules.expiry_date", label: "Expiry date is valid", status: "FAIL", severity: "review", evidence: "Expiry date cannot be parsed." };
  }
  const isExpired = Date.parse(`${dateOfExpiry}T23:59:59Z`) < Date.now();
  return {
    id: "rules.expiry_date",
    label: "Expiry date is current",
    status: isExpired ? "FAIL" : "PASS",
    severity: isExpired ? "review" : "info",
    evidence: isExpired ? "The synthetic document is expired." : "The synthetic document has not expired."
  };
}

export function analyzeScreening(input = {}) {
  let parsed;
  try {
    parsed = parseTd3Mrz(input.mrzLine1, input.mrzLine2);
  } catch (error) {
    return invalidMrzResult(error.message);
  }

  const scenario = getScenario(input.scenarioId);
  const visibleFields = input.visibleFields || scenario?.visibleFields || {};
  const dataChecks = [
    fieldAgreementCheck("fields.name", "Printed name agrees with MRZ", parsed.fields.name, visibleFields.name),
    fieldAgreementCheck("fields.document_number", "Printed document number agrees with MRZ", parsed.fields.documentNumber, visibleFields.documentNumber),
    fieldAgreementCheck("fields.birth_date", "Printed date of birth agrees with MRZ", parsed.fields.dateOfBirth, visibleFields.dateOfBirth),
    fieldAgreementCheck("fields.expiry_date", "Printed expiry date agrees with MRZ", parsed.fields.dateOfExpiry, visibleFields.dateOfExpiry),
    expiryCheck(parsed.fields.dateOfExpiry)
  ];
  const allChecks = [...parsed.checks, ...dataChecks];
  const signals = scenario?.signals || [];
  const failedMrzCheck = parsed.checks.some((item) => item.status === "FAIL");
  const failedDataCheck = dataChecks.some((item) => item.status === "FAIL");
  const reasons = [];
  if (failedMrzCheck) reasons.push("MRZ_CHECKSUM_FAILED");
  if (failedDataCheck) reasons.push("FIELD_OR_RULE_MISMATCH");
  if (signals.length) reasons.push("SIMULATED_IMAGE_ANOMALY");

    const faceVerif = input.faceVerification;
    let identityComparison = { status: "UNAVAILABLE", detail: "No face comparison or identification is performed." };
    if (faceVerif) {
      if (faceVerif.success && faceVerif.match === true) {
        identityComparison = { status: "CLEAR", detail: `Face matches document photo. Distance: ${faceVerif.distance.toFixed(2)}` };
        allChecks.push({ id: "face.match", label: "Face verification", status: "PASS", severity: "info", evidence: "DeepFace matching successful." });
      } else if (faceVerif.success && faceVerif.match === false) {
        identityComparison = { status: "REVIEW", detail: `Face mismatch. Distance: ${faceVerif.distance.toFixed(2)}` };
        reasons.push("FACE_MISMATCH");
        allChecks.push({ id: "face.match", label: "Face verification", status: "FAIL", severity: "review", evidence: "Document photo and live selfie do not match." });
      } else {
        identityComparison = { status: "REVIEW", detail: "Face verification failed to run." };
        allChecks.push({ id: "face.match", label: "Face verification", status: "FAIL", severity: "review", evidence: "Failed to detect face or run verification." });
      }
    }

    const tamper = input.tamperingResult;
    let imageAnomaly = {
        status: signals.length ? "REVIEW" : "NOT_ASSESSED",
        detail: signals.length ? "Fixture-only visual anomaly indicators are present; no image model ran." : "No image-forensics adapter is enabled."
    };
    if (tamper) {
      if (tamper.success) {
        if (tamper.tampered) {
          imageAnomaly = { status: "REVIEW", detail: `High ELA variance (${tamper.score.toFixed(0)}) indicates possible localized tampering.` };
          reasons.push("TAMPERING_DETECTED");
          allChecks.push({ id: "tamper.ela", label: "Tampering Detection (ELA)", status: "FAIL", severity: "review", evidence: "High variance detected in error level analysis." });
        } else {
          imageAnomaly = { status: "CLEAR", detail: `ELA variance (${tamper.score.toFixed(0)}) is within normal limits.` };
          allChecks.push({ id: "tamper.ela", label: "Tampering Detection (ELA)", status: "PASS", severity: "info", evidence: "Image compression levels appear consistent." });
        }
      }
    }

    const triage = reasons.length ? "MANUAL_REVIEW" : "NO_HIGH_RISK_SIGNAL_DETECTED";
    const inputMode = scenario ? "synthetic-demo" : "manual-fictional-test";
    const checkStates = allChecks.map((item) => `${item.id}:${item.status}`);

    return {
      screeningId: randomUUID(),
      notice: TEST_DATA_NOTICE,
      triage,
      reasonCodes: reasons,
      analysisAxes: {
        captureQuality: { status: "NOT_ASSESSED", detail: "This starter accepts MRZ text, not images or camera capture." },
        dataConsistency: {
          status: failedMrzCheck || failedDataCheck ? "REVIEW" : "CLEAR",
          detail: failedMrzCheck || failedDataCheck ? "At least one deterministic MRZ or field check needs human review." : "All supplied deterministic checks agree."
        },
        imageAnomaly,
        identityComparison
      },
    fields: [
      { id: "name", label: "Name", maskedValue: maskValue(parsed.fields.name, 4), source: "MRZ" },
      { id: "documentNumber", label: "Document number", maskedValue: maskValue(parsed.fields.documentNumber), source: "MRZ" },
      { id: "nationality", label: "Nationality code", maskedValue: parsed.fields.nationality || "—", source: "MRZ" },
      { id: "dateOfBirth", label: "Date of birth", maskedValue: maskValue(parsed.fields.dateOfBirth), source: "MRZ" },
      { id: "dateOfExpiry", label: "Expiry date", maskedValue: maskValue(parsed.fields.dateOfExpiry), source: "MRZ" }
    ],
    checks: allChecks,
    signals,
    auditDigest: createAuditDigest(inputMode, triage, reasons, checkStates, signals.map((signal) => signal.id)),
    limitations: [
      "This result is triage assistance for a fictional fixture, not proof of authenticity.",
      "No OCR, image upload, metadata analysis, watchlist lookup, facial recognition, storage, or external API is used.",
      "A trained human must make any real-world decision."
    ]
  };
}

export const _internal = { buildTd3Line1, buildTd3Line2, checkDigit };
