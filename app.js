const elements = {
  scenarioGrid: document.querySelector("#scenarioGrid"),
  form: document.querySelector("#screeningForm"),
  mrzLine1: document.querySelector("#mrzLine1"),
  mrzLine2: document.querySelector("#mrzLine2"),
  visibleName: document.querySelector("#visibleName"),
  visibleDocumentNumber: document.querySelector("#visibleDocumentNumber"),
  visibleDateOfBirth: document.querySelector("#visibleDateOfBirth"),
  visibleDateOfExpiry: document.querySelector("#visibleDateOfExpiry"),
  documentImage: document.querySelector("#documentImage"),
  liveImage: document.querySelector("#liveImage"),
  testOnly: document.querySelector("#testOnly"),
  triageBadge: document.querySelector("#triageBadge"),
  emptyResult: document.querySelector("#emptyResult"),
  resultContent: document.querySelector("#resultContent"),
  triageDescription: document.querySelector("#triageDescription"),
  axesGrid: document.querySelector("#axesGrid"),
  fieldList: document.querySelector("#fieldList"),
  checkList: document.querySelector("#checkList"),
  signalSection: document.querySelector("#signalSection"),
  signalList: document.querySelector("#signalList"),
  auditDigest: document.querySelector("#auditDigest"),
  limitationsList: document.querySelector("#limitationsList")
};

let scenarios = [];
let selectedScenarioId = null;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id);
}

function renderScenarios() {
  elements.scenarioGrid.replaceChildren();
  scenarios.forEach((scenario) => {
    const button = makeElement("button", "scenario-card");
    button.type = "button";
    button.dataset.scenarioId = scenario.id;
    button.setAttribute("aria-pressed", String(scenario.id === selectedScenarioId));
    button.append(makeElement("span", "scenario-index", `0${scenarios.indexOf(scenario) + 1}`));
    button.append(makeElement("strong", null, scenario.title));
    button.append(makeElement("span", "scenario-copy", scenario.description));
    button.addEventListener("click", () => selectScenario(scenario.id));
    elements.scenarioGrid.append(button);
  });
}

function selectScenario(id) {
  const scenario = getScenario(id);
  if (!scenario) return;
  selectedScenarioId = id;
  elements.mrzLine1.value = scenario.mrzLine1;
  elements.mrzLine2.value = scenario.mrzLine2;
  elements.visibleName.value = scenario.visibleFields.name;
  elements.visibleDocumentNumber.value = scenario.visibleFields.documentNumber;
  elements.visibleDateOfBirth.value = scenario.visibleFields.dateOfBirth;
  elements.visibleDateOfExpiry.value = scenario.visibleFields.dateOfExpiry;
  elements.testOnly.checked = true;
  renderScenarios();
}

function visualStatus(status) {
  return status.toLowerCase().replaceAll("_", "-");
}

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function triageCopy(result) {
  if (result.triage === "RETAKE_IMAGE") return "The synthetic MRZ cannot be checked reliably. Retake or rescan the fictional fixture before a human reviews it.";
  if (result.triage === "MANUAL_REVIEW") return "One or more explainable signals need a trained human to inspect the fictional fixture. This is not an authenticity verdict.";
  return "No high-risk signal was found in the checks available in this starter. This is not an approval or authenticity decision.";
}

function renderResult(result) {
  elements.emptyResult.hidden = true;
  elements.resultContent.hidden = false;
  elements.triageBadge.className = `triage-badge ${visualStatus(result.triage)}`;
  elements.triageBadge.textContent = statusLabel(result.triage);
  elements.triageDescription.textContent = triageCopy(result);

  elements.axesGrid.replaceChildren();
  Object.entries(result.analysisAxes).forEach(([name, axis]) => {
    const card = makeElement("article", `axis-card ${visualStatus(axis.status)}`);
    card.append(makeElement("span", "axis-name", name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())));
    card.append(makeElement("strong", null, statusLabel(axis.status)));
    card.append(makeElement("p", null, axis.detail));
    elements.axesGrid.append(card);
  });

  elements.fieldList.replaceChildren();
  result.fields.forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.append(makeElement("dt", null, field.label));
    const definition = makeElement("dd", null, field.maskedValue);
    definition.title = `Source: ${field.source}`;
    wrapper.append(definition);
    elements.fieldList.append(wrapper);
  });

  elements.checkList.replaceChildren();
  result.checks.forEach((item) => {
    const listItem = makeElement("li", `evidence-item ${visualStatus(item.status)}`);
    const topLine = makeElement("div", "evidence-topline");
    topLine.append(makeElement("strong", null, item.label));
    topLine.append(makeElement("span", "status-chip", statusLabel(item.status)));
    listItem.append(topLine);
    listItem.append(makeElement("p", null, item.evidence));
    elements.checkList.append(listItem);
  });

  elements.signalList.replaceChildren();
  result.signals.forEach((signal) => {
    const listItem = makeElement("li", "evidence-item review");
    listItem.append(makeElement("strong", null, signal.label));
    listItem.append(makeElement("p", null, signal.evidence));
    elements.signalList.append(listItem);
  });
  elements.signalSection.hidden = result.signals.length === 0;

  elements.auditDigest.textContent = result.auditDigest;
  elements.limitationsList.replaceChildren();
  result.limitations.forEach((limitation) => elements.limitationsList.append(makeElement("li", null, limitation)));
}

function showError(message) {
  renderResult({
    triage: "RETAKE_IMAGE",
    analysisAxes: {
      captureQuality: { status: "RETAKE", detail: message },
      dataConsistency: { status: "NOT_ASSESSED", detail: "No result was returned." },
      imageAnomaly: { status: "NOT_ASSESSED", detail: "No result was returned." },
      identityComparison: { status: "UNAVAILABLE", detail: "No result was returned." }
    },
    fields: [],
    checks: [{ label: "Request", status: "FAIL", evidence: message }],
    signals: [],
    auditDigest: "No digest created",
    limitations: ["No document data is stored by this starter."]
  });
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Checking synthetic fixture…";
  
  let faceVerification = null;
  let tamperingResult = null;

  try {
    const docFile = elements.documentImage.files[0];
    const liveFile = elements.liveImage.files[0];
    
    // 1. Run Tampering Detection (ELA) if document image is present
    if (docFile) {
      submitButton.textContent = "Running Tampering Detection…";
      const tamperData = new FormData();
      tamperData.append("document_image", docFile);
      
      const tamperRes = await fetch("http://127.0.0.1:8001/api/v1/tampering", {
        method: "POST",
        body: tamperData
      });
      if (tamperRes.ok) {
        tamperingResult = await tamperRes.json();
      }
    }

    // 2. Run face verification if both images are present
    if (docFile && liveFile) {
      submitButton.textContent = "Running DeepFace verification…";
      const faceData = new FormData();
      faceData.append("document_image", docFile);
      faceData.append("live_image", liveFile);
      
      const faceRes = await fetch("http://127.0.0.1:8001/api/v1/verify-face", {
        method: "POST",
        body: faceData
      });
      if (faceRes.ok) {
        faceVerification = await faceRes.json();
      }
    }
    
    submitButton.textContent = "Running explainable triage…";

    // 3. Run analysis
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: selectedScenarioId,
        mrzLine1: elements.mrzLine1.value,
        mrzLine2: elements.mrzLine2.value,
        visibleFields: {
          name: elements.visibleName.value,
          documentNumber: elements.visibleDocumentNumber.value,
          dateOfBirth: elements.visibleDateOfBirth.value,
          dateOfExpiry: elements.visibleDateOfExpiry.value
        },
        testOnly: elements.testOnly.checked,
        faceVerification,
        tamperingResult
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The demo could not process that input.");
    renderResult(body);
  } catch (error) {
    showError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run explainable triage →";
  }
});

elements.documentImage.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const originalLabel = elements.documentImage.previousElementSibling.textContent;
  elements.documentImage.previousElementSibling.textContent = "Extracting MRZ...";
  
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("http://127.0.0.1:8001/api/v1/extract", {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) throw new Error("Failed to process image locally.");
    const body = await response.json();
    
    if (body.success && body.mrz_raw) {
      // Split raw text into two lines (TD3 format)
      const lines = body.mrz_raw.split('\n').filter(Boolean);
      if (lines.length >= 2) {
        elements.mrzLine1.value = lines[0];
        elements.mrzLine2.value = lines[1];
      }
      
      // Auto-fill printed fields as if they were typed, assuming they match MRZ for demo
      if (body.fields) {
        elements.visibleName.value = body.fields.name || "";
        elements.visibleDocumentNumber.value = body.fields.documentNumber || "";
        
        // Convert YYMMDD to YYYY-MM-DD for date inputs
        const formatMrzDate = (val) => {
          if (!val || val.length !== 6) return "";
          let year = Number(val.slice(0, 2));
          year += (year > 30) ? 1900 : 2000;
          return `${year}-${val.slice(2, 4)}-${val.slice(4, 6)}`;
        };
        
        elements.visibleDateOfBirth.value = formatMrzDate(body.fields.dateOfBirth);
        elements.visibleDateOfExpiry.value = formatMrzDate(body.fields.dateOfExpiry);
      }
      
      // Clear scenario selection
      selectedScenarioId = null;
      renderScenarios();
    } else {
      showError(body.error || "No MRZ found in the image.");
    }
  } catch (error) {
    showError(error.message);
  } finally {
    elements.documentImage.previousElementSibling.textContent = originalLabel;
  }
});

async function start() {
  try {
    const response = await fetch("/api/scenarios");
    const body = await response.json();
    scenarios = body.scenarios || [];
    renderScenarios();
    if (scenarios.length) selectScenario(scenarios[0].id);
  } catch {
    showError("The local demo scenarios could not be loaded.");
  }
}

start();
