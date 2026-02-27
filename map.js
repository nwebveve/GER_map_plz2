const regionsGroup = document.getElementById("regions");
const labelsGroup = document.getElementById("labels");
const selectedPlz = document.getElementById("selectedPlz");
const regionHint = document.getElementById("regionHint");
const serviceList = document.getElementById("serviceList");
const infoPopup = document.getElementById("infoPopup");
const closePopupButton = document.getElementById("closePopup");
const svg = document.getElementById("plzMap");

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_WIDTH = 860;
const VIEW_HEIGHT = 900;
const PADDING = 22;
const REQUIRED_ROLES = ["VAD", "KAMLIGHT", "KAMHEAVY"];

const regionNodes = new Map();
const labelNodes = new Map();
let regionsByCode = new Map();
let activeCode = null;
let contactDirectory = new Map();

function parseCoord(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value.replace(",", "."));
  return Number.NaN;
}

function parsePlz2(feature) {
  const zip = feature?.properties?.destatis?.zip;
  if (!zip) return null;

  const value = String(zip).trim();
  if (!/^\d{5}$/.test(value)) return null;
  return value.slice(0, 2);
}

function featureToPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function aggregatePlzRegions(features) {
  const groups = new Map();

  for (const feature of features) {
    const code = parsePlz2(feature);
    if (!code) continue;

    if (!groups.has(code)) {
      groups.set(code, {
        code,
        polygons: [],
        centerLonSum: 0,
        centerLatSum: 0,
        centerCount: 0
      });
    }

    const group = groups.get(code);
    group.polygons.push(...featureToPolygons(feature.geometry));

    const lon = parseCoord(feature?.properties?.destatis?.center_lon);
    const lat = parseCoord(feature?.properties?.destatis?.center_lat);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      group.centerLonSum += lon;
      group.centerLatSum += lat;
      group.centerCount += 1;
    }
  }

  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function projectGeoPoint(lon, lat) {
  const lonRad = (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  return {
    x: lonRad,
    y: Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  };
}

function computeBounds(regions) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const region of regions) {
    for (const polygon of region.polygons) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          const projected = projectGeoPoint(lon, lat);
          if (projected.x < minX) minX = projected.x;
          if (projected.x > maxX) maxX = projected.x;
          if (projected.y < minY) minY = projected.y;
          if (projected.y > maxY) maxY = projected.y;
        }
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

function createProjector(bounds) {
  const xSpan = bounds.maxX - bounds.minX;
  const ySpan = bounds.maxY - bounds.minY;
  const scale = Math.min(
    (VIEW_WIDTH - PADDING * 2) / xSpan,
    (VIEW_HEIGHT - PADDING * 2) / ySpan
  );

  const drawWidth = xSpan * scale;
  const drawHeight = ySpan * scale;
  const offsetX = (VIEW_WIDTH - drawWidth) / 2;
  const offsetY = (VIEW_HEIGHT - drawHeight) / 2;

  return (lon, lat) => {
    const point = projectGeoPoint(lon, lat);
    return {
      x: offsetX + (point.x - bounds.minX) * scale,
      y: offsetY + (bounds.maxY - point.y) * scale
    };
  };
}

function projectPolygon(polygon, project) {
  return polygon.map((ring) =>
    ring.map(([lon, lat]) => {
      const p = project(lon, lat);
      return [p.x, p.y];
    })
  );
}

function projectedRingToPath(ring) {
  if (!ring.length) return "";
  const coords = ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`);
  return `M ${coords.join(" L ")} Z`;
}

function projectedPolygonToPath(polygon) {
  return polygon.map((ring) => projectedRingToPath(ring)).join(" ");
}

function getProjectedRegionBounds(projectedPolygons) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const polygon of projectedPolygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

function fallbackLabelPosition(region, project) {
  const ring = region?.polygons?.[0]?.[0];
  if (!ring || !ring.length) return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };

  let lonSum = 0;
  let latSum = 0;

  for (const [lon, lat] of ring) {
    lonSum += lon;
    latSum += lat;
  }

  return project(lonSum / ring.length, latSum / ring.length);
}

function estimateLabelBox(x, y, text, fontSize) {
  const width = Math.max(14, text.length * (fontSize * 0.72) + 6);
  const height = fontSize + 3;

  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height + 1,
    bottom: y + 1
  };
}

function overlapsAny(box, placedBoxes) {
  return placedBoxes.some(
    (other) =>
      box.left < other.right &&
      box.right > other.left &&
      box.top < other.bottom &&
      box.bottom > other.top
  );
}

function isPointOnSegment(px, py, ax, ay, bx, by) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 0.001) return false;

  const dot = (px - ax) * (px - bx) + (py - ay) * (py - by);
  return dot <= 0;
}

function pointInRing(x, y, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    if (isPointOnSegment(x, y, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInProjectedPolygon(x, y, polygon) {
  if (!polygon.length || !pointInRing(x, y, polygon[0])) return false;

  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(x, y, polygon[i])) return false;
  }

  return true;
}

function pointInProjectedRegion(x, y, projectedPolygons) {
  for (const polygon of projectedPolygons) {
    if (pointInProjectedPolygon(x, y, polygon)) return true;
  }
  return false;
}

function isBoxInsideRegion(box, projectedPolygons, strict) {
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;

  const samplePoints = strict
    ? [
        [centerX, centerY],
        [box.left + 1, centerY],
        [box.right - 1, centerY],
        [centerX, box.top + 1],
        [centerX, box.bottom - 1]
      ]
    : [[centerX, centerY]];

  return samplePoints.every(([x, y]) => pointInProjectedRegion(x, y, projectedPolygons));
}

function buildCandidateOffsets() {
  const candidates = [{ dx: 0, dy: 0 }];

  for (let radius = 5; radius <= 72; radius += 5) {
    for (let degree = 0; degree < 360; degree += 24) {
      const angle = (degree * Math.PI) / 180;
      candidates.push({
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius
      });
    }
  }

  return candidates;
}

const labelOffsets = buildCandidateOffsets();

function tryFindPlacementWithGrid(
  base,
  code,
  placedBoxes,
  projectedPolygons,
  bounds,
  fontSize,
  strict,
  step
) {
  let bestCandidate = null;
  let bestDistance = Infinity;

  const minX = Math.max(PADDING, Math.floor(bounds.minX));
  const maxX = Math.min(VIEW_WIDTH - PADDING, Math.ceil(bounds.maxX));
  const minY = Math.max(PADDING, Math.floor(bounds.minY));
  const maxY = Math.min(VIEW_HEIGHT - PADDING, Math.ceil(bounds.maxY));

  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const box = estimateLabelBox(x, y, code, fontSize);
      if (
        box.left < PADDING ||
        box.right > VIEW_WIDTH - PADDING ||
        box.top < PADDING ||
        box.bottom > VIEW_HEIGHT - PADDING
      ) {
        continue;
      }

      if (!isBoxInsideRegion(box, projectedPolygons, strict)) continue;
      if (overlapsAny(box, placedBoxes)) continue;

      const dx = x - base.x;
      const dy = y - base.y;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestCandidate = { x, y, box, fontSize };
      }
    }
  }

  return bestCandidate;
}

function findLabelPlacement(base, code, placedBoxes, regionShape) {
  const { projectedPolygons, bounds } = regionShape;
  const fontSizes = [8.6, 8.0, 7.4, 6.8];

  for (const fontSize of fontSizes) {
    for (const offset of labelOffsets) {
      const x = base.x + offset.dx;
      const y = base.y + offset.dy;
      const box = estimateLabelBox(x, y, code, fontSize);

      if (
        box.left < PADDING ||
        box.right > VIEW_WIDTH - PADDING ||
        box.top < PADDING ||
        box.bottom > VIEW_HEIGHT - PADDING
      ) {
        continue;
      }

      if (!isBoxInsideRegion(box, projectedPolygons, true)) continue;
      if (overlapsAny(box, placedBoxes)) continue;

      return { x, y, box, fontSize };
    }

    const gridPlacement = tryFindPlacementWithGrid(
      base,
      code,
      placedBoxes,
      projectedPolygons,
      bounds,
      fontSize,
      true,
      5
    );

    if (gridPlacement) return gridPlacement;
  }

  for (const fontSize of [7.0, 6.6]) {
    for (const offset of labelOffsets) {
      const x = base.x + offset.dx;
      const y = base.y + offset.dy;
      const box = estimateLabelBox(x, y, code, fontSize);

      if (
        box.left < PADDING ||
        box.right > VIEW_WIDTH - PADDING ||
        box.top < PADDING ||
        box.bottom > VIEW_HEIGHT - PADDING
      ) {
        continue;
      }

      if (!isBoxInsideRegion(box, projectedPolygons, false)) continue;
      if (overlapsAny(box, placedBoxes)) continue;

      return { x, y, box, fontSize };
    }

    const relaxedGridPlacement = tryFindPlacementWithGrid(
      base,
      code,
      placedBoxes,
      projectedPolygons,
      bounds,
      fontSize,
      false,
      5
    );

    if (relaxedGridPlacement) return relaxedGridPlacement;
  }

  for (const fontSize of [6.2, 5.8, 5.2]) {
    const denseGridPlacement = tryFindPlacementWithGrid(
      base,
      code,
      placedBoxes,
      projectedPolygons,
      bounds,
      fontSize,
      false,
      3
    );
    if (denseGridPlacement) return denseGridPlacement;
  }

  for (const fontSize of [4.8, 4.4, 4.0]) {
    const finalGridPlacement = tryFindPlacementWithGrid(
      base,
      code,
      placedBoxes,
      projectedPolygons,
      bounds,
      fontSize,
      false,
      2
    );
    if (finalGridPlacement) return finalGridPlacement;
  }

  return null;
}

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function getDefaultContact(code, role) {
  return {
    role,
    name: `${role} Team ${code}`,
    tel: "+49 30 0000 0000",
    mail: `${role.toLowerCase()}.plz${code}@intranet.local`
  };
}

function buildContactDirectory(records) {
  const directory = new Map();

  for (const raw of records) {
    const plz2 = String(raw?.plz2 || "").padStart(2, "0");
    const role = normalizeRole(raw?.role);
    const name = String(raw?.name || "").trim();
    const tel = String(raw?.tel || "").trim();
    const mail = String(raw?.mail || "").trim();

    if (!/^\d{2}$/.test(plz2) || !role || !name || !tel || !mail) {
      continue;
    }

    if (!directory.has(plz2)) directory.set(plz2, new Map());
    directory.get(plz2).set(role, { role, name, tel, mail });
  }

  return directory;
}

function resolveContactForRole(code, role) {
  const normalizedRole = normalizeRole(role);
  const byPlz = contactDirectory.get(code);

  if (byPlz && byPlz.has(normalizedRole)) {
    return byPlz.get(normalizedRole);
  }

  return getDefaultContact(code, normalizedRole);
}

function createContactData(code) {
  return REQUIRED_ROLES.map((role) => resolveContactForRole(code, role));
}
function closePopupAndClearSelection() {
  if (activeCode) {
    const activeRegion = regionNodes.get(activeCode);
    const activeLabel = labelNodes.get(activeCode);
    if (activeRegion) activeRegion.classList.remove("active");
    if (activeLabel) activeLabel.classList.remove("active");
  }

  activeCode = null;
  infoPopup.hidden = true;
  selectedPlz.textContent = "--";
  regionHint.textContent = "";
  serviceList.innerHTML = "";
}

function renderPopup(region) {
  selectedPlz.textContent = region.code;
  regionHint.textContent = "Kontaktdaten im gewählten PLZ-Gebiet.";

  const contacts = createContactData(region.code);
  serviceList.innerHTML = "";

  for (const contact of contacts) {
    const item = document.createElement("article");
    item.className = "service-item";
    item.innerHTML = `
      <div class="service-title">${contact.role}</div>
      <div class="service-meta">
        <span>Name: <strong>${contact.name}</strong></span>
        <span>Tel: <strong><a href="tel:${contact.tel.replace(/\s+/g, "")}">${contact.tel}</a></strong></span>
        <span>Mail: <strong><a href="mailto:${contact.mail}">${contact.mail}</a></strong></span>
      </div>
    `;

    serviceList.appendChild(item);
  }

  infoPopup.hidden = false;
}

function activateRegion(code) {
  const currentRegion = activeCode ? regionNodes.get(activeCode) : null;
  const currentLabel = activeCode ? labelNodes.get(activeCode) : null;
  if (currentRegion) currentRegion.classList.remove("active");
  if (currentLabel) currentLabel.classList.remove("active");

  const nextRegion = regionNodes.get(code);
  const nextLabel = labelNodes.get(code);
  if (!nextRegion) return;

  nextRegion.classList.add("active");
  if (nextLabel) nextLabel.classList.add("active");
  activeCode = code;

  const region = regionsByCode.get(code);
  if (region) renderPopup(region);
}

function drawRegions(regions) {
  if (!regions.length) return;

  const bounds = computeBounds(regions);
  const project = createProjector(bounds);
  regionsByCode = new Map(regions.map((region) => [region.code, region]));

  const labelCandidates = [];

  for (const region of regions) {
    const projectedPolygons = region.polygons.map((polygon) => projectPolygon(polygon, project));
    const projectedBounds = getProjectedRegionBounds(projectedPolygons);

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "plz-region");
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `PLZ-Gebiet ${region.code}`);

    const area = document.createElementNS(SVG_NS, "path");
    area.setAttribute("class", "plz-area");
    area.setAttribute("d", projectedPolygons.map((polygon) => projectedPolygonToPath(polygon)).join(" "));

    let labelBase =
      region.centerCount > 0
        ? project(region.centerLonSum / region.centerCount, region.centerLatSum / region.centerCount)
        : fallbackLabelPosition(region, project);

    if (!pointInProjectedRegion(labelBase.x, labelBase.y, projectedPolygons)) {
      labelBase = {
        x: (projectedBounds.minX + projectedBounds.maxX) / 2,
        y: (projectedBounds.minY + projectedBounds.maxY) / 2
      };
    }

    labelCandidates.push({
      code: region.code,
      base: labelBase,
      projectedPolygons,
      bounds: projectedBounds,
      priority: (projectedBounds.maxX - projectedBounds.minX) * (projectedBounds.maxY - projectedBounds.minY)
    });

    const onActivate = () => activateRegion(region.code);
    group.addEventListener("click", onActivate);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    });

    group.append(area);
    regionsGroup.appendChild(group);
    regionNodes.set(region.code, group);
  }

  const placedBoxes = [];
  const sortedLabels = [...labelCandidates].sort((a, b) => b.priority - a.priority);

  for (const candidate of sortedLabels) {
    const placement = findLabelPlacement(candidate.base, candidate.code, placedBoxes, candidate);
    if (!placement) continue;

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "plz-label");
    label.setAttribute("x", placement.x.toFixed(2));
    label.setAttribute("y", placement.y.toFixed(2));
    label.style.fontSize = `${placement.fontSize.toFixed(1)}px`;
    label.textContent = candidate.code;

    labelsGroup.appendChild(label);
    labelNodes.set(candidate.code, label);
    placedBoxes.push(placement.box);
  }
}

async function loadContactDirectory() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}plz_contacts.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (Array.isArray(payload?.contacts)) {
      contactDirectory = buildContactDirectory(payload.contacts);
      return;
    }

    contactDirectory = new Map();
  } catch (error) {
    console.warn("Kontaktdaten konnten nicht geladen werden, Fallback wird verwendet.", error);
    contactDirectory = new Map();
  }
}
async function init() {
  try {
    const [geoResponse] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}gemeinden_simplify200.geojson`),
      loadContactDirectory()
    ]);

    if (!geoResponse.ok) throw new Error(`HTTP ${geoResponse.status}`);

    const geoJson = await geoResponse.json();
    drawRegions(aggregatePlzRegions(geoJson.features ?? []));
    closePopupAndClearSelection();
  } catch (error) {
    console.error("GeoJSON konnte nicht geladen werden:", error);
    closePopupAndClearSelection();
  }
}

closePopupButton.addEventListener("click", closePopupAndClearSelection);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !infoPopup.hidden) closePopupAndClearSelection();
});

svg.setAttribute("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
init();
