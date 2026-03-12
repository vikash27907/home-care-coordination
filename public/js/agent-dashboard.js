(function dashboardController() {
  const state = {
    useMockData: true,
    stats: {
      pendingRequests: 0,
      activeJobs: 0,
      availableNurses: 0,
      revenue: 0
    },
    requests: [],
    applications: [],
    nurses: [],
    financialSummary: {
      grossAmount: 0,
      platformFee: 0,
      agentMargin: 0,
      nursePayout: 0
    },
    financialRows: [],
    monthly: []
  };

  const mock = {
    stats: {
      pendingRequests: 4,
      activeJobs: 3,
      availableNurses: 6,
      revenue: 128400
    },
    requests: [
      { id: 101, patient: "Ravi Sharma", city: "Delhi", care_type: "ICU Nurse", status: "open" },
      { id: 102, patient: "Sunita Devi", city: "Noida", care_type: "Elder Care", status: "assigned" },
      { id: 103, patient: "Arjun Singh", city: "Gurugram", care_type: "Post Surgery", status: "active" },
      { id: 104, patient: "Meera Gupta", city: "Delhi", care_type: "Home Nursing", status: "payment_pending" }
    ],
    applications: [
      { id: 9001, request_id: 101, nurse_id: 21, nurse_name: "Priya Kumari", city: "Delhi", care_type: "ICU Nurse", status: "pending" },
      { id: 9002, request_id: 104, nurse_id: 24, nurse_name: "Nikita Das", city: "Noida", care_type: "Home Nursing", status: "accepted" }
    ],
    nurses: [
      { id: 21, full_name: "Priya Kumari", city: "Delhi", experience_years: 4, is_available: true, status: "approved", active_jobs: 1 },
      { id: 24, full_name: "Nikita Das", city: "Noida", experience_years: 5, is_available: true, status: "approved", active_jobs: 2 },
      { id: 28, full_name: "Anita Rai", city: "Gurugram", experience_years: 2, is_available: false, status: "pending", active_jobs: 0 }
    ],
    financialSummary: {
      grossAmount: 280000,
      platformFee: 38000,
      agentMargin: 38000,
      nursePayout: 242000
    },
    financialRows: [
      {
        request_id: 101,
        patient_name: "Ravi Sharma",
        nurse_name: "Priya Kumari",
        gross_amount: 90000,
        platform_fee: 12000,
        nurse_payout: 78000,
        payout_status: "pending"
      },
      {
        request_id: 103,
        patient_name: "Arjun Singh",
        nurse_name: "Nikita Das",
        gross_amount: 190000,
        platform_fee: 26000,
        nurse_payout: 164000,
        payout_status: "approved"
      }
    ],
    monthly: [
      { month: "Oct", revenue: 14000, completed_jobs: 1, active_nurses: 1 },
      { month: "Nov", revenue: 19000, completed_jobs: 1, active_nurses: 2 },
      { month: "Dec", revenue: 22000, completed_jobs: 2, active_nurses: 3 },
      { month: "Jan", revenue: 24000, completed_jobs: 2, active_nurses: 2 },
      { month: "Feb", revenue: 26000, completed_jobs: 3, active_nurses: 4 },
      { month: "Mar", revenue: 30000, completed_jobs: 3, active_nurses: 4 }
    ]
  };

  const nodes = {
    search: document.getElementById("requestSearch"),
    cityFilter: document.getElementById("cityFilter"),
    careTypeFilter: document.getElementById("careTypeFilter"),
    statusFilter: document.getElementById("statusFilter"),
    requestsBody: document.getElementById("requestsTableBody"),
    applicationsBody: document.getElementById("applicationsTableBody"),
    nursesBody: document.getElementById("nursesTableBody"),
    financialBody: document.getElementById("financialTableBody"),
    monthlyChart: document.getElementById("monthlyChart"),
    feed: document.getElementById("actionFeed"),
    statPending: document.getElementById("statPendingRequests"),
    statActive: document.getElementById("statActiveJobs"),
    statAvailable: document.getElementById("statAvailableNurses"),
    statRevenue: document.getElementById("statRevenue"),
    grossAmount: document.getElementById("grossAmount"),
    platformFee: document.getElementById("platformFee"),
    agentMargin: document.getElementById("agentMargin"),
    nursePayout: document.getElementById("nursePayout"),
    navLinks: Array.from(document.querySelectorAll("[data-nav-link]"))
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusClass(value) {
    return `status--${String(value || "").trim().toLowerCase().replace(/\s+/g, "_") || "pending"}`;
  }

  function formatCurrency(value) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amount);
  }

  function toNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function addFeed(message, kind) {
    if (!nodes.feed) return;
    const timeLabel = new Date().toLocaleTimeString();
    const safeMessage = escapeHtml(message);
    const safeKind = escapeHtml(kind || "info");
    nodes.feed.insertAdjacentHTML(
      "afterbegin",
      `<li><div>${safeMessage}</div><div class="feed-item__meta">${safeKind.toUpperCase()} • ${timeLabel}</div></li>`
    );
    while (nodes.feed.children.length > 12) {
      nodes.feed.removeChild(nodes.feed.lastElementChild);
    }
  }

  async function fetchJson(url, init) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      ...init
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body && body.error) {
          message = body.error;
        }
      } catch (error) {
        // Ignore parse errors and use default message.
      }
      throw new Error(message);
    }

    return response.json();
  }

  function renderStats() {
    if (nodes.statPending) nodes.statPending.textContent = String(state.stats.pendingRequests || 0);
    if (nodes.statActive) nodes.statActive.textContent = String(state.stats.activeJobs || 0);
    if (nodes.statAvailable) nodes.statAvailable.textContent = String(state.stats.availableNurses || 0);
    if (nodes.statRevenue) nodes.statRevenue.textContent = formatCurrency(state.stats.revenue || 0);
  }

  function filteredRequests() {
    const searchTerm = String(nodes.search && nodes.search.value || "").trim().toLowerCase();
    const city = String(nodes.cityFilter && nodes.cityFilter.value || "all").toLowerCase();
    const careType = String(nodes.careTypeFilter && nodes.careTypeFilter.value || "all").toLowerCase();
    const status = String(nodes.statusFilter && nodes.statusFilter.value || "all").toLowerCase();

    return state.requests.filter((request) => {
      const requestCity = String(request.city || "").toLowerCase();
      const requestCareType = String(request.care_type || "").toLowerCase();
      const requestStatus = String(request.status || "").toLowerCase();
      const requestSearchBlob = [
        request.id,
        request.patient,
        request.city,
        request.care_type,
        request.status
      ].join(" ").toLowerCase();

      if (city !== "all" && requestCity !== city) return false;
      if (careType !== "all" && requestCareType !== careType) return false;
      if (status !== "all" && requestStatus !== status) return false;
      if (searchTerm && !requestSearchBlob.includes(searchTerm)) return false;
      return true;
    });
  }

  function actionsForRequest(row) {
    const status = String(row.status || "").toLowerCase();
    const actions = [`<button class="action-btn" data-request-action="view" data-request-id="${row.id}">View Request</button>`];

    if (status === "open" || status === "assigned" || status === "payment_pending") {
      actions.unshift(`<button class="action-btn action-btn--primary" data-request-action="assign" data-request-id="${row.id}">Assign Nurse</button>`);
    }
    if (status === "assigned" || status === "payment_pending") {
      actions.push(`<button class="action-btn" data-request-action="start" data-request-id="${row.id}">Start Job</button>`);
    }
    if (status === "active") {
      actions.push(`<button class="action-btn action-btn--danger" data-request-action="complete" data-request-id="${row.id}">Complete Job</button>`);
    }

    return `<div class="row-actions">${actions.join("")}</div>`;
  }

  function renderRequests() {
    if (!nodes.requestsBody) return;

    const rows = filteredRequests();
    if (!rows.length) {
      nodes.requestsBody.innerHTML = '<tr><td colspan="6">No requests found for the selected filters.</td></tr>';
      return;
    }

    nodes.requestsBody.innerHTML = rows.map((request) => `
      <tr>
        <td>#${escapeHtml(request.id)}</td>
        <td>${escapeHtml(request.patient || "-")}</td>
        <td>${escapeHtml(request.city || "-")}</td>
        <td>${escapeHtml(request.care_type || "-")}</td>
        <td><span class="status-pill ${statusClass(request.status)}">${escapeHtml(request.status || "pending")}</span></td>
        <td>${actionsForRequest(request)}</td>
      </tr>
    `).join("");
  }

  function renderApplications() {
    if (!nodes.applicationsBody) return;

    if (!state.applications.length) {
      nodes.applicationsBody.innerHTML = '<tr><td colspan="7">No nurse applications available.</td></tr>';
      return;
    }

    nodes.applicationsBody.innerHTML = state.applications.map((row) => `
      <tr>
        <td>#${escapeHtml(row.id)}</td>
        <td>#${escapeHtml(row.request_id)}</td>
        <td>${escapeHtml(row.nurse_name || "-")}</td>
        <td>${escapeHtml(row.city || "-")}</td>
        <td>${escapeHtml(row.care_type || "-")}</td>
        <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status || "pending")}</span></td>
        <td>
          <div class="row-actions">
            <button class="action-btn action-btn--primary" data-application-action="assign" data-request-id="${row.request_id}" data-nurse-id="${row.nurse_id}">Assign Nurse</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function renderNurses() {
    if (!nodes.nursesBody) return;

    if (!state.nurses.length) {
      nodes.nursesBody.innerHTML = '<tr><td colspan="7">No nurses found.</td></tr>';
      return;
    }

    nodes.nursesBody.innerHTML = state.nurses.map((nurse) => {
      const availabilityText = nurse.is_available ? "Available" : "Unavailable";
      return `
        <tr>
          <td>N-${escapeHtml(nurse.id)}</td>
          <td><a href="/agent/nurses/${escapeHtml(nurse.id)}">${escapeHtml(nurse.full_name || "-")}</a></td>
          <td>${escapeHtml(nurse.city || "-")}</td>
          <td>${escapeHtml(nurse.experience_years || 0)} years</td>
          <td><span class="status-pill ${statusClass(availabilityText)}">${escapeHtml(availabilityText)}</span></td>
          <td><span class="status-pill ${statusClass(nurse.status)}">${escapeHtml(nurse.status || "pending")}</span></td>
          <td>${escapeHtml(nurse.active_jobs || 0)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderFinancials() {
    if (nodes.grossAmount) nodes.grossAmount.textContent = formatCurrency(state.financialSummary.grossAmount);
    if (nodes.platformFee) nodes.platformFee.textContent = formatCurrency(state.financialSummary.platformFee);
    if (nodes.agentMargin) nodes.agentMargin.textContent = formatCurrency(state.financialSummary.agentMargin);
    if (nodes.nursePayout) nodes.nursePayout.textContent = formatCurrency(state.financialSummary.nursePayout);

    if (!nodes.financialBody) return;

    if (!state.financialRows.length) {
      nodes.financialBody.innerHTML = '<tr><td colspan="7">No financial records available yet.</td></tr>';
      return;
    }

    nodes.financialBody.innerHTML = state.financialRows.map((row) => `
      <tr>
        <td>#${escapeHtml(row.request_id)}</td>
        <td>${escapeHtml(row.patient_name || "-")}</td>
        <td>${escapeHtml(row.nurse_name || "-")}</td>
        <td>${escapeHtml(formatCurrency(row.gross_amount || 0))}</td>
        <td>${escapeHtml(formatCurrency(row.platform_fee || 0))}</td>
        <td>${escapeHtml(formatCurrency(row.nurse_payout || row.net_amount || 0))}</td>
        <td><span class="status-pill ${statusClass(row.payout_status)}">${escapeHtml(row.payout_status || "pending")}</span></td>
      </tr>
    `).join("");
  }

  function renderChart() {
    if (!nodes.monthlyChart) return;
    if (!state.monthly.length) {
      nodes.monthlyChart.innerHTML = "<p>No monthly data available.</p>";
      return;
    }

    const maxRevenue = Math.max(...state.monthly.map((row) => toNumber(row.revenue)), 1);
    const maxCompleted = Math.max(...state.monthly.map((row) => toNumber(row.completed_jobs)), 1);
    const maxNurses = Math.max(...state.monthly.map((row) => toNumber(row.active_nurses)), 1);

    nodes.monthlyChart.innerHTML = state.monthly.map((row) => {
      const revenueHeight = Math.max(6, Math.round((toNumber(row.revenue) / maxRevenue) * 88));
      const completedHeight = Math.max(6, Math.round((toNumber(row.completed_jobs) / maxCompleted) * 88));
      const nursesHeight = Math.max(6, Math.round((toNumber(row.active_nurses) / maxNurses) * 88));
      return `
        <div class="chart-col">
          <div class="chart-bars">
            <span class="chart-bar chart-bar--revenue" style="height:${revenueHeight}px" title="Revenue"></span>
            <span class="chart-bar chart-bar--completed" style="height:${completedHeight}px" title="Completed Jobs"></span>
            <span class="chart-bar chart-bar--nurses" style="height:${nursesHeight}px" title="Active Nurses"></span>
          </div>
          <span class="chart-label">${escapeHtml(row.month)}</span>
        </div>
      `;
    }).join("");
  }

  function fillSelectOptions(node, values, labelFormatter) {
    if (!node) return;
    const currentValue = node.value;
    node.innerHTML = `<option value="all">All ${labelFormatter("header")}</option>` + values.map((value) => {
      const safe = escapeHtml(value);
      return `<option value="${safe.toLowerCase()}">${safe}</option>`;
    }).join("");
    node.value = values.some((value) => value.toLowerCase() === currentValue) ? currentValue : "all";
  }

  function populateFilters() {
    const cities = Array.from(new Set(state.requests.map((row) => String(row.city || "").trim()).filter(Boolean))).sort();
    const careTypes = Array.from(new Set(state.requests.map((row) => String(row.care_type || "").trim()).filter(Boolean))).sort();
    const statuses = Array.from(new Set(state.requests.map((row) => String(row.status || "").trim()).filter(Boolean))).sort();

    fillSelectOptions(nodes.cityFilter, cities, () => "Cities");
    fillSelectOptions(nodes.careTypeFilter, careTypes, () => "Care Types");
    fillSelectOptions(nodes.statusFilter, statuses, () => "Status");
  }

  function renderAll() {
    renderStats();
    populateFilters();
    renderRequests();
    renderApplications();
    renderNurses();
    renderFinancials();
    renderChart();
  }

  function normalizeMonthlyRows(rows) {
    const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
    const now = new Date();
    const months = [];
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        month: formatter.format(date),
        revenue: 0,
        completed_jobs: 0,
        active_nurses: 0
      });
    }

    const indexByKey = months.reduce((acc, row, rowIndex) => {
      acc[row.key] = rowIndex;
      return acc;
    }, {});

    rows.forEach((row) => {
      const monthStart = row.month_start ? new Date(row.month_start) : null;
      if (!monthStart || Number.isNaN(monthStart.getTime())) return;
      const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
      const targetIndex = indexByKey[key];
      if (typeof targetIndex !== "number") return;
      months[targetIndex] = {
        key,
        month: formatter.format(monthStart),
        revenue: toNumber(row.revenue),
        completed_jobs: toNumber(row.completed_jobs),
        active_nurses: toNumber(row.active_nurses)
      };
    });

    return months.map(({ key, ...row }) => row);
  }

  async function loadDataFromApi() {
    const [stats, requests, applications, nurses, financials, monthly] = await Promise.all([
      fetchJson("/agent/dashboard/stats"),
      fetchJson("/agent/requests"),
      fetchJson("/agent/applications"),
      fetchJson("/agent/nurses"),
      fetchJson("/agent/financials"),
      fetchJson("/agent/dashboard/monthly")
    ]);

    state.stats = {
      pendingRequests: toNumber(stats.pendingRequests),
      activeJobs: toNumber(stats.activeJobs),
      availableNurses: toNumber(stats.availableNurses),
      revenue: toNumber(stats.revenue)
    };
    state.requests = Array.isArray(requests) ? requests : [];
    state.applications = Array.isArray(applications) ? applications : [];
    state.nurses = Array.isArray(nurses) ? nurses : [];

    const summary = financials && financials.summary ? financials.summary : {};
    state.financialSummary = {
      grossAmount: toNumber(summary.grossAmount),
      platformFee: toNumber(summary.platformFee),
      agentMargin: toNumber(summary.agentMargin),
      nursePayout: toNumber(summary.nursePayout)
    };
    state.financialRows = financials && Array.isArray(financials.rows) ? financials.rows : [];
    state.monthly = normalizeMonthlyRows(Array.isArray(monthly) ? monthly : []);
    state.useMockData = false;
  }

  function useMockData(reason) {
    state.useMockData = true;
    state.stats = { ...mock.stats };
    state.requests = [...mock.requests];
    state.applications = [...mock.applications];
    state.nurses = [...mock.nurses];
    state.financialSummary = { ...mock.financialSummary };
    state.financialRows = [...mock.financialRows];
    state.monthly = [...mock.monthly];
    addFeed(`Using mock data (${reason}).`, "warning");
  }

  function updateMockRequestStatus(requestId, action, nurseId) {
    const request = state.requests.find((item) => String(item.id) === String(requestId));
    if (!request) return;
    if (action === "assign") {
      request.status = "assigned";
      if (nurseId) {
        addFeed(`Mock assign: request #${requestId} -> nurse ${nurseId}.`, "info");
      }
      return;
    }
    if (action === "start") {
      request.status = "active";
      return;
    }
    if (action === "complete") {
      request.status = "completed";
      return;
    }
  }

  async function performRequestAction(action, requestId, nurseId) {
    if (state.useMockData) {
      updateMockRequestStatus(requestId, action, nurseId);
      renderAll();
      addFeed(`Mock action executed: ${action} on request #${requestId}.`, "success");
      return;
    }

    const payload = { action };
    if (action === "assign") {
      payload.nurseId = nurseId;
    }

    const response = await fetchJson(`/agent/requests/${requestId}/actions`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    addFeed(response.message || `Action ${action} applied on request #${requestId}.`, "success");
    await loadDataFromApi();
    renderAll();
  }

  async function onRequestActionClick(event) {
    const target = event.target.closest("[data-request-action]");
    if (!target) return;

    const action = String(target.getAttribute("data-request-action") || "").trim().toLowerCase();
    const requestId = Number.parseInt(target.getAttribute("data-request-id"), 10);
    if (!requestId || !action) return;

    if (action === "view") {
      window.location.href = `/track-request?requestId=${encodeURIComponent(requestId)}`;
      return;
    }

    let nurseId = null;
    if (action === "assign") {
      const input = window.prompt("Enter nurse ID to assign:");
      if (!input) return;
      const parsed = Number.parseInt(input, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        addFeed("Invalid nurse ID.", "error");
        return;
      }
      nurseId = parsed;
    }

    try {
      await performRequestAction(action, requestId, nurseId);
    } catch (error) {
      addFeed(error.message || "Action failed.", "error");
    }
  }

  async function onApplicationActionClick(event) {
    const target = event.target.closest("[data-application-action='assign']");
    if (!target) return;

    const requestId = Number.parseInt(target.getAttribute("data-request-id"), 10);
    const nurseId = Number.parseInt(target.getAttribute("data-nurse-id"), 10);
    if (!requestId || !nurseId) return;

    try {
      await performRequestAction("assign", requestId, nurseId);
    } catch (error) {
      addFeed(error.message || "Unable to assign nurse.", "error");
    }
  }

  function bindFilterHandlers() {
    const triggers = [nodes.search, nodes.cityFilter, nodes.careTypeFilter, nodes.statusFilter].filter(Boolean);
    triggers.forEach((node) => node.addEventListener("input", renderRequests));
    [nodes.cityFilter, nodes.careTypeFilter, nodes.statusFilter].filter(Boolean).forEach((node) => {
      node.addEventListener("change", renderRequests);
    });
  }

  function bindSectionNavigation() {
    if (!nodes.navLinks.length) return;

    nodes.navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        nodes.navLinks.forEach((item) => item.classList.remove("is-active"));
        link.classList.add("is-active");
      });
    });
  }

  function bindTableHandlers() {
    if (nodes.requestsBody) {
      nodes.requestsBody.addEventListener("click", onRequestActionClick);
    }
    if (nodes.applicationsBody) {
      nodes.applicationsBody.addEventListener("click", onApplicationActionClick);
    }
  }

  async function bootstrap() {
    try {
      await loadDataFromApi();
      addFeed("Connected to live dashboard APIs.", "success");
    } catch (error) {
      useMockData(error.message || "API not reachable");
    }

    renderAll();
    bindFilterHandlers();
    bindSectionNavigation();
    bindTableHandlers();
  }

  if (document.getElementById("agentDashboard")) {
    bootstrap();
  }
})();
