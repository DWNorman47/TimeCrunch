import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';
import { parseBinQR } from './BinLabelModal';
import { parseItemQR } from './ItemLabelModal';
import UomConversionModal from './UomConversionModal';
import { useT } from '../../hooks/useT';

function useCountTypes(t) {
  return {
    cycle:     { label: t.invCycCycleCount,     color: '#2563eb', bg: '#dbeafe',   desc: t.invCycCycleDesc },
    full:      { label: t.invCycFullCount,      color: '#8b5cf6', bg: '#ede9fe',   desc: t.invCycFullDesc },
    audit:     { label: t.invCycAuditCount,     color: '#d97706', bg: '#fef3c7',   desc: t.invCycAuditDesc },
    reconcile: { label: t.invCycReconcileCount, color: '#059669', bg: '#d1fae5',   desc: t.invCycReconcileDesc },
  };
}

function useStatusColors(t) {
  return {
    draft:       { color: '#6b7280', bg: '#f3f4f6', label: t.invCycDraft },
    in_progress: { color: '#2563eb', bg: '#dbeafe', label: t.invCycInProgress },
    completed:   { color: '#059669', bg: '#d1fae5', label: t.invCycCompleted },
  };
}

function TypeBadge({ type }) {
  const t = useT();
  const COUNT_TYPES = useCountTypes(t);
  const ct = COUNT_TYPES[type] || COUNT_TYPES.cycle;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
      color: ct.color, background: ct.bg, whiteSpace: 'nowrap' }}>
      {ct.label}
    </span>
  );
}

function CycleCountDetail({ count, onBack, onComplete }) {
  const t = useT();
  const COUNT_TYPES = useCountTypes(t);
  const STATUS_COLORS = useStatusColors(t);
  const [lines, setLines] = useState(count.lines || []);
  const [countData, setCountData] = useState(count);
  const [saving, setSaving] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportLines, setReportLines] = useState(null); // non-null after completion
  // UOM support: per-line selected UOM and lazy-loaded item UOM lists
  const [lineUomSelections, setLineUomSelections] = useState({}); // { [lineId]: uomId | null }
  const [lineInputValues, setLineInputValues]     = useState({}); // { [lineId]: string }
  const [itemUomCache, setItemUomCache]           = useState({}); // { [itemId]: [uoms] }
  const [conversionPrompt, setConversionPrompt]   = useState(null); // { lineId, itemId, uom, baseUnit }

  const fetchItemUoms = async (itemId) => {
    if (itemUomCache[itemId]) return;
    try {
      const r = await api.get(`/inventory/items/${itemId}/uoms`);
      setItemUomCache(prev => ({ ...prev, [itemId]: r.data.filter(u => u.active) }));
    } catch {}
  };

  // ── Scan Mode ────────────────────────────────────────────────────────────────
  const [scanMode, setScanMode] = useState(false);
  const [currentBin, setCurrentBin] = useState(null); // { type, id, name }
  const [highlightedId, setHighlightedId] = useState(null);
  const [scanFeedback, setScanFeedback] = useState(''); // success/error message
  const scanInputRef = useRef(null);
  const lineInputRefs = useRef({}); // { [lineId]: inputElement }

  // Keep scan input focused whenever scan mode is on and nothing else is focused
  useEffect(() => {
    if (!scanMode) return;
    const refocus = () => {
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        scanInputRef.current?.focus();
      }
    };
    document.addEventListener('click', refocus);
    scanInputRef.current?.focus();
    return () => document.removeEventListener('click', refocus);
  }, [scanMode]);

  // Auto-focus line count input when a line is highlighted
  useEffect(() => {
    if (highlightedId != null) {
      const el = lineInputRefs.current[highlightedId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.focus(), 150);
      }
    }
  }, [highlightedId]);

  const showFeedback = (msg, isError = false) => {
    setScanFeedback({ msg, isError });
    setTimeout(() => setScanFeedback(''), 2500);
  };

  const processScan = (raw) => {
    const value = raw.trim();
    if (!value) return;

    // 1. Try to parse as bin QR code
    const bin = parseBinQR(value);
    if (bin) {
      setCurrentBin(bin);
      setHighlightedId(null);
      showFeedback(`Bin set: ${bin.name}`);
      return;
    }

    // 2. Try to parse as item QR code
    const itemQR = parseItemQR(value);
    if (itemQR) {
      const match = lines.find(l => l.item_id === itemQR.id);
      if (match) {
        setHighlightedId(match.id);
        showFeedback(`Found: ${match.item_name}`);
      } else {
        showFeedback(`Item "${itemQR.name}" not in this count`, true);
      }
      return;
    }

    // 3. Try to match against item SKUs in the count lines
    const match = lines.find(l =>
      l.sku && l.sku.trim().toLowerCase() === value.toLowerCase()
    );
    if (match) {
      setHighlightedId(match.id);
      showFeedback(`Found: ${match.item_name}`);
    } else {
      showFeedback(`"${value}" not found in this count`, true);
    }
  };

  const isAudit = countData.count_type === 'audit';
  const isFull  = countData.count_type === 'full';

  const patchLine = async (line, countedQty, countedUomId) => {
    setSaving(line.id);
    try {
      const payload = { counted_qty: countedQty };
      // Always send counted_uom_id so the server can compute correct variance
      payload.counted_uom_id = (countedUomId !== undefined ? countedUomId : lineUomSelections[line.id]) ?? null;
      const r = await api.patch(`/inventory/cycle-counts/${count.id}/lines/${line.id}`, payload);
      setLines(prev => prev.map(l => l.id === line.id ? { ...l, ...r.data } : l));
    } catch (e) {
      alert(e.response?.data?.error || t.invCycFailedSave);
    } finally {
      setSaving(null);
    }
  };

  const advanceStatus = async () => {
    try {
      const r = await api.patch(`/inventory/cycle-counts/${count.id}`, { status: 'in_progress' });
      setCountData(r.data);
    } catch (e) { alert(e.response?.data?.error || t.invCycFailedStatus); }
  };

  const complete = async () => {
    setCompleting(true); setError('');
    try {
      await api.post(`/inventory/cycle-counts/${count.id}/complete`);
      setConfirmOpen(false);
      setReportLines(lines); // show variance report
    } catch (e) {
      setError(e.response?.data?.error || t.invCycFailedComplete);
      setCompleting(false); setConfirmOpen(false);
    } finally {
      setCompleting(false);
    }
  };

  const downloadVarianceCSV = (reportData) => {
    const header = ['Item', 'SKU', 'Unit', 'Expected Qty', 'Counted Qty', 'Variance'];
    const rows = reportData.map(l => {
      const expected = parseFloat(l.expected_qty);
      const counted  = l.counted_qty != null ? parseFloat(l.counted_qty) : '';
      const variance = counted !== '' ? counted - expected : '';
      return [
        `"${l.item_name.replace(/"/g, '""')}"`,
        l.sku || '',
        l.unit,
        expected,
        counted,
        variance,
      ].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `variance-report-${count.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uncounted = lines.filter(l => l.counted_qty === null || l.counted_qty === undefined).length;
  const variantLines = lines.filter(l => {
    if (l.counted_qty === null || l.counted_qty === undefined) return false;
    return parseFloat(l.variance ?? (parseFloat(l.counted_qty) - parseFloat(l.expected_qty))) !== 0;
  });
  const sc = STATUS_COLORS[countData.status] || STATUS_COLORS.draft;
  const isCompleted = countData.status === 'completed';

  // Group lines by location for full counts
  const groupedLines = isFull
    ? lines.reduce((acc, line) => {
        const loc = line.location_name || 'Unknown Location';
        if (!acc[loc]) acc[loc] = [];
        acc[loc].push(line);
        return acc;
      }, {})
    : null;

  const renderLine = (line, i) => {
    const counted = line.counted_qty !== null && line.counted_qty !== undefined;
    // variance is now stored in stock UOM units by the server
    const variance = line.variance != null ? parseFloat(line.variance) : null;
    const showExpected = !isAudit || isCompleted;
    const isHighlighted = highlightedId === line.id;
    const rowStyle = isHighlighted
      ? { ...d.row, background: '#fef9c3', outline: '2px solid #f59e0b' }
      : i % 2 === 0 ? d.rowEven : d.row;

    // UOM resolution
    const stockUnit      = line.stock_uom_unit  || line.unit;  // unit of the expected qty
    const stockUomId     = line.stock_uom_id    || null;
    const stockFactor    = parseFloat(line.stock_uom_factor  || 1);
    const availableUoms  = itemUomCache[line.item_id] || [];
    const selectedUomId  = lineUomSelections[line.id] !== undefined
      ? lineUomSelections[line.id] : stockUomId;
    const selectedUom    = availableUoms.find(u => u.id === selectedUomId);
    const selectedUnit   = selectedUom ? `${selectedUom.unit}${selectedUom.unit_spec ? ` (${selectedUom.unit_spec})` : ''}` : stockUnit;
    const isDifferentUom = selectedUomId !== stockUomId;

    // Conversion hint: show what the current input value converts to in stock units
    const inputVal = lineInputValues[line.id];
    let conversionHint = null;
    if (isDifferentUom && inputVal !== undefined && inputVal !== '') {
      const n = parseFloat(inputVal);
      if (!isNaN(n) && selectedUom) {
        const countedFactor = parseFloat(selectedUom.factor || 1);
        const inStockUnits = n * (countedFactor / stockFactor);
        conversionHint = `= ${inStockUnits % 1 === 0 ? inStockUnits.toFixed(0) : inStockUnits.toFixed(3).replace(/\.?0+$/, '')} ${stockUnit}`;
      }
    }

    return (
      <tr key={line.id} id={`ccline-${line.id}`} style={rowStyle}>
        <td style={{ ...d.td, fontWeight: 600 }}>{line.item_name}</td>
        <td style={{ ...d.td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{line.sku || '—'}</td>
        <td style={{ ...d.td, color: '#6b7280' }}>{stockUnit}</td>
        {showExpected && (
          <td style={{ ...d.td, textAlign: 'right' }}>{parseFloat(line.expected_qty)}</td>
        )}
        <td style={{ ...d.td }}>
          {!isCompleted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  ref={el => { lineInputRefs.current[line.id] = el; }}
                  style={{ ...d.countInput, ...(isHighlighted ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fde68a' } : {}) }}
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={counted ? line.counted_qty : ''}
                  placeholder="—"
                  disabled={saving === line.id}
                  onChange={e => setLineInputValues(prev => ({ ...prev, [line.id]: e.target.value }))}
                  onFocus={() => { if (!itemUomCache[line.item_id]) fetchItemUoms(line.item_id); }}
                  onBlur={e => {
                    const val = e.target.value;
                    if (val !== '' && val !== String(line.counted_qty)) patchLine(line, parseFloat(val));
                    if (scanMode) setTimeout(() => scanInputRef.current?.focus(), 50);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.target.blur(); setHighlightedId(null); }
                  }}
                />
                {/* UOM selector — only shown if item has alternate UOMs */}
                {availableUoms.length > 1 && (
                  <select
                    style={d.uomSelect}
                    value={selectedUomId ?? ''}
                    onChange={e => {
                      const newUomId = e.target.value ? parseInt(e.target.value) : null;
                      setLineUomSelections(prev => ({ ...prev, [line.id]: newUomId }));
                      // Check if conversion factor needs to be set
                      const newUom = availableUoms.find(u => u.id === newUomId);
                      if (newUom && !newUom.is_base && parseFloat(newUom.factor) === 1) {
                        setConversionPrompt({ lineId: line.id, itemId: line.item_id, uom: newUom, baseUnit: stockUnit });
                      }
                      // If a qty is already entered, re-patch with new UOM
                      const inputEl = lineInputRefs.current[line.id];
                      if (inputEl && inputEl.value !== '') {
                        patchLine(line, parseFloat(inputEl.value), newUomId);
                      }
                    }}
                  >
                    {availableUoms.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.unit}{u.unit_spec ? ` (${u.unit_spec})` : ''}{u.is_base ? ' — base' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {conversionHint && (
                <span style={{ fontSize: 11, color: '#6b7280' }}>{conversionHint}</span>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'right' }}>
              <span>{counted ? parseFloat(line.counted_qty) : '—'}</span>
              {line.counted_uom_unit && line.counted_uom_unit !== stockUnit && (
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>{line.counted_uom_unit}</span>
              )}
            </div>
          )}
        </td>
        {showExpected && (
          <td style={{ ...d.td, textAlign: 'right', fontWeight: variance !== null && variance !== 0 ? 700 : 400,
            color: variance === null ? '#9ca3af' : variance > 0 ? '#059669' : variance < 0 ? '#dc2626' : '#374151' }}>
            {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance % 1 === 0 ? variance.toFixed(0) : variance.toFixed(3).replace(/\.?0+$/, '')} ${stockUnit}`}
          </td>
        )}
        <td style={{ ...d.td, fontSize: 13, color: '#6b7280' }}>{line.counted_by_name || '—'}</td>
      </tr>
    );
  };

  const renderTableHead = (showExpected) => (
    <thead>
      <tr style={d.thead}>
        <th style={d.th}>{t.invCycColItem}</th>
        <th style={d.th}>{t.invCycColSku}</th>
        <th style={d.th}>{t.invCycColUnit}</th>
        {showExpected && <th style={{ ...d.th, textAlign: 'right' }}>{t.invCycColExpected}</th>}
        <th style={{ ...d.th, textAlign: 'right' }}>{t.invCycColCounted}</th>
        {showExpected && <th style={{ ...d.th, textAlign: 'right' }}>{t.invCycColVariance}</th>}
        <th style={d.th}>{t.invCycColCountedBy}</th>
      </tr>
    </thead>
  );

  const showExpected = !isAudit || isCompleted;

  return (
    <div style={d.wrap}>
      <button style={d.back} onClick={onBack}>{t.invCycBackToList}</button>

      <div style={d.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={d.title}>{COUNT_TYPES[countData.count_type]?.label || 'Count'} — {countData.location_name}</h2>
            <TypeBadge type={countData.count_type} />
          </div>
          <p style={d.sub}>{t.invCycStartedBy} {countData.started_by_name} · {new Date(countData.started_at).toLocaleDateString()}</p>
          {isAudit && !isCompleted && (
            <p style={{ ...d.sub, color: '#d97706', fontWeight: 600, marginTop: 4 }}>
              {t.invCycAuditMode}
            </p>
          )}
        </div>
        <div style={d.headerRight}>
          <span style={{ ...d.statusBadge, color: sc.color, background: sc.bg }}>{sc.label}</span>
          {countData.status === 'draft' && (
            <button style={d.advanceBtn} onClick={advanceStatus}>{t.invCycStartCounting}</button>
          )}
          {countData.status === 'in_progress' && (
            <>
              <button
                style={{ ...d.scanModeBtn, ...(scanMode ? d.scanModeBtnActive : {}) }}
                onClick={() => { setScanMode(s => !s); setHighlightedId(null); setCurrentBin(null); }}
              >
                {scanMode ? t.invCycScanModeOn : t.invCycScanMode}
              </button>
              <button
                style={{ ...d.completeBtn, opacity: uncounted > 0 ? 0.5 : 1 }}
                onClick={() => uncounted > 0 ? alert(`${uncounted} ${t.invCycItemsNotCounted}`) : setConfirmOpen(true)}
              >
                {t.invCycCompleteCount}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div style={d.error}>{error}</div>}

      {/* ── Scan Panel ── */}
      {scanMode && (
        <div style={d.scanPanel}>
          <div style={d.scanBinRow}>
            <span style={d.scanBinLabel}>
              {currentBin
                ? <>📍 <strong>{currentBin.name}</strong> <span style={{ color: '#9ca3af', fontSize: 12 }}>({currentBin.type})</span></>
                : <span style={{ color: '#9ca3af' }}>📍 {t.invCycNoBinScanned}</span>
              }
            </span>
            {currentBin && (
              <button style={d.scanClearBtn} onClick={() => setCurrentBin(null)}>{t.invCycClearBin}</button>
            )}
          </div>
          <div style={d.scanInputRow}>
            <input
              ref={scanInputRef}
              style={d.scanInput}
              type="text"
              placeholder={t.invCycScanPlaceholder}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  processScan(e.target.value);
                  e.target.value = '';
                }
              }}
              onChange={() => {}} // controlled by ref
            />
          </div>
          {scanFeedback && (
            <div style={{ ...d.scanFeedback, color: scanFeedback.isError ? '#dc2626' : '#059669',
              background: scanFeedback.isError ? '#fee2e2' : '#d1fae5' }}>
              {scanFeedback.msg}
            </div>
          )}
          <p style={d.scanHint}>{t.invCycScanHint}</p>
        </div>
      )}

      {lines.length === 0 ? (
        <div style={d.empty}>{t.invCycNoItems}</div>
      ) : isFull ? (
        // Full count: render table grouped by location
        Object.entries(groupedLines).map(([locName, locLines]) => (
          <div key={locName} style={{ marginBottom: 24 }}>
            <div style={d.locationHeader}>{locName}</div>
            <div style={d.tableWrap}>
              <table style={d.table}>
                {renderTableHead(showExpected)}
                <tbody>{locLines.map((line, i) => renderLine(line, i))}</tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <div style={d.tableWrap}>
          <table style={d.table}>
            {renderTableHead(showExpected)}
            <tbody>{lines.map((line, i) => renderLine(line, i))}</tbody>
          </table>
        </div>
      )}

      {uncounted > 0 && countData.status === 'in_progress' && (
        <p style={d.uncountedNote}>{uncounted} {t.invCycItemsNotCounted}</p>
      )}

      {reportLines && (
        <div style={d.modalOverlay}>
          <div style={{ ...d.modal, maxWidth: 560 }}>
            <h3 style={d.modalTitle}>{t.invCycVarianceReport}</h3>
            {(() => {
              const withVariance = reportLines.filter(l => {
                if (l.counted_qty == null) return false;
                return parseFloat(l.counted_qty) - parseFloat(l.expected_qty) !== 0;
              });
              const noVariance = reportLines.filter(l => {
                if (l.counted_qty == null) return true;
                return parseFloat(l.counted_qty) - parseFloat(l.expected_qty) === 0;
              });
              return (
                <>
                  <p style={d.modalBody}>
                    {withVariance.length === 0
                      ? t.invCycNoVariances
                      : `${withVariance.length} ${t.invCycWithVariance} ${noVariance.length} ${t.invCycMatched}`}
                  </p>
                  <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          <th style={d.rth}>Item</th>
                          <th style={{ ...d.rth, textAlign: 'right' }}>Expected</th>
                          <th style={{ ...d.rth, textAlign: 'right' }}>Counted</th>
                          <th style={{ ...d.rth, textAlign: 'right' }}>Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...withVariance, ...noVariance].map((l, i) => {
                          const expected = parseFloat(l.expected_qty);
                          const counted  = l.counted_qty != null ? parseFloat(l.counted_qty) : null;
                          const variance = counted != null ? counted - expected : null;
                          const isVar    = variance !== null && variance !== 0;
                          return (
                            <tr key={l.id} style={{ background: isVar ? '#fff7ed' : (i % 2 === 0 ? '#fafafa' : '#fff') }}>
                              <td style={{ ...d.rtd, fontWeight: isVar ? 700 : 400 }}>
                                {isFull && l.location_name ? <span style={{ color: '#9ca3af', marginRight: 4 }}>{l.location_name} —</span> : ''}
                                {l.item_name}
                              </td>
                              <td style={{ ...d.rtd, textAlign: 'right', color: '#6b7280' }}>{expected} {l.unit}</td>
                              <td style={{ ...d.rtd, textAlign: 'right' }}>{counted != null ? `${counted} ${l.unit}` : <em style={{ color: '#9ca3af' }}>{t.invCycNotCounted}</em>}</td>
                              <td style={{ ...d.rtd, textAlign: 'right', fontWeight: 700,
                                color: variance === null ? '#9ca3af' : variance > 0 ? '#059669' : variance < 0 ? '#dc2626' : '#374151' }}>
                                {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
            <div style={d.modalActions}>
              <button style={d.cancelBtn} onClick={() => { setReportLines(null); onComplete(); }}>{t.cancel}</button>
              <button style={{ ...d.confirmBtn, background: '#2563eb' }} onClick={() => downloadVarianceCSV(reportLines)}>
                {t.invCycDownloadCSV}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div style={d.modalOverlay}>
          <div style={d.modal}>
            <h3 style={d.modalTitle}>{t.invCycConfirmComplete} {COUNT_TYPES[countData.count_type]?.label || ''}?</h3>
            {variantLines.length > 0 ? (
              <>
                <p style={d.modalBody}>{variantLines.length} {t.invCycAdjustments}</p>
                <ul style={d.modalList}>
                  {variantLines.map(l => {
                    const v = parseFloat(l.counted_qty) - parseFloat(l.expected_qty);
                    return (
                      <li key={l.id} style={d.modalListItem}>
                        {isFull && l.location_name ? `${l.location_name} — ` : ''}{l.item_name}: {v > 0 ? `+${v}` : v} {l.unit}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p style={d.modalBody}>{t.invCycNoVariancesConfirm}</p>
            )}
            <div style={d.modalActions}>
              <button style={d.cancelBtn} onClick={() => setConfirmOpen(false)}>{t.cancel}</button>
              <button style={d.confirmBtn} onClick={complete} disabled={completing}>
                {completing ? t.invCycCompleting : t.invCycConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {conversionPrompt && (
        <UomConversionModal
          itemId={conversionPrompt.itemId}
          uom={conversionPrompt.uom}
          baseUnit={conversionPrompt.baseUnit}
          onSaved={updatedList => {
            setItemUomCache(prev => ({
              ...prev,
              [conversionPrompt.itemId]: updatedList.filter(u => u.active),
            }));
            setConversionPrompt(null);
          }}
          onDismiss={() => setConversionPrompt(null)}
        />
      )}
    </div>
  );
}

export default function InventoryCycleCounts({ locations, onComplete }) {
  const t = useT();
  const COUNT_TYPES = useCountTypes(t);
  const STATUS_COLORS = useStatusColors(t);
  const [counts, setCounts] = useState([]);
  const [countsTotal, setCountsTotal] = useState(0);
  const [countsOffset, setCountsOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newLocationId, setNewLocationId] = useState('');
  const [newCountType, setNewCountType] = useState('cycle');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  const CC_PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true); setCountsOffset(0);
    try {
      const params = new URLSearchParams({ limit: CC_PAGE, offset: 0 });
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('count_type', filterType);
      if (filterLocation) params.set('location_id', filterLocation);
      const r = await api.get(`/inventory/cycle-counts?${params}`);
      setCounts(r.data.counts);
      setCountsTotal(r.data.total);
    } catch { setError(t.invCycFailedLoad); }
    finally { setLoading(false); }
  }, [filterStatus, filterType, filterLocation]);

  const loadMoreCounts = async () => {
    const nextOffset = countsOffset + CC_PAGE;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: CC_PAGE, offset: nextOffset });
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('count_type', filterType);
      if (filterLocation) params.set('location_id', filterLocation);
      const r = await api.get(`/inventory/cycle-counts?${params}`);
      setCounts(prev => [...prev, ...r.data.counts]);
      setCountsOffset(nextOffset);
    } catch { /* non-fatal */ }
    finally { setLoadingMore(false); }
  };

  useEffect(() => { load(); }, [load]);

  const startCount = async () => {
    if (newCountType !== 'full' && !newLocationId) return alert('Select a location.');
    setCreating(true);
    try {
      const payload = { count_type: newCountType, notes: null };
      if (newCountType !== 'full') payload.location_id = parseInt(newLocationId);
      const r = await api.post('/inventory/cycle-counts', payload);
      setSelected(r.data);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create count.');
    } finally {
      setCreating(false); setNewLocationId('');
    }
  };

  const openCount = async (count) => {
    try {
      const r = await api.get(`/inventory/cycle-counts/${count.id}`);
      setSelected(r.data);
    } catch { alert('Failed to load count details.'); }
  };

  const handleComplete = () => {
    setSelected(null);
    load();
    onComplete?.();
  };

  if (selected) {
    return (
      <CycleCountDetail
        count={selected}
        onBack={() => { setSelected(null); load(); }}
        onComplete={handleComplete}
      />
    );
  }

  const activeLocations = locations.filter(l => l.active);
  const needsLocation = newCountType !== 'full';

  return (
    <div style={s.wrap}>
      {/* Start new count */}
      <div style={s.startCard}>
        <div style={s.startRow}>
          <select style={s.typeSelect} value={newCountType} onChange={e => { setNewCountType(e.target.value); setNewLocationId(''); }}>
            {Object.entries(COUNT_TYPES).map(([key, ct]) => (
              <option key={key} value={key}>{ct.label}</option>
            ))}
          </select>
          {needsLocation && (
            <select style={s.select} value={newLocationId} onChange={e => setNewLocationId(e.target.value)}>
              <option value="">{t.invCycSelectLocation}</option>
              {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button style={s.startBtn} onClick={startCount} disabled={creating || (needsLocation && !newLocationId)}>
            {creating ? t.invCycCreating : t.invCycStartCount}
          </button>
        </div>
        {newCountType && (
          <p style={s.typeDesc}>{COUNT_TYPES[newCountType]?.desc}</p>
        )}
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select style={s.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">{t.invCycAllTypes}</option>
          {Object.entries(COUNT_TYPES).map(([key, ct]) => (
            <option key={key} value={key}>{ct.label}</option>
          ))}
        </select>
        <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t.invCycAllStatuses}</option>
          <option value="draft">{t.invCycDraft}</option>
          <option value="in_progress">{t.invCycInProgress}</option>
          <option value="completed">{t.invCycCompleted}</option>
        </select>
        <select style={s.select} value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
          <option value="">{t.invCycAllLocations}</option>
          {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.empty}>{t.loading}</div>
      ) : counts.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <p>{t.invCycNoCountsYet}</p>
        </div>
      ) : (
        <>
        <div style={s.list}>
          {counts.map(count => {
            const sc = STATUS_COLORS[count.status] || STATUS_COLORS.draft;
            const pct = count.line_count > 0 ? Math.round((count.counted_count / count.line_count) * 100) : 0;
            return (
              <div key={count.id} style={s.card} onClick={() => openCount(count)}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.cardTitle}>{count.location_name}</div>
                    <div style={s.cardMeta}>
                      {t.invCycStartedBy} {count.started_by_name} · {new Date(count.started_at).toLocaleDateString()}
                      {count.completed_at && ` · ${t.invCycCompleted} ${new Date(count.completed_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <TypeBadge type={count.count_type} />
                    <span style={{ ...s.badge, color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </div>
                </div>
                <div style={s.cardProgress}>
                  <span style={s.cardProgressText}>{count.counted_count}/{count.line_count} {t.invCycItemsCounted}</span>
                  {count.status !== 'completed' && count.line_count > 0 && (
                    <div style={s.progressBar}>
                      <div style={{ ...s.progressFill, width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {counts.length < countsTotal && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button style={s.select} onClick={loadMoreCounts} disabled={loadingMore}>
              {loadingMore ? t.loading : t.loadMore}
            </button>
            <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>{counts.length} / {countsTotal}</span>
          </div>
        )}
        </>
      )}
    </div>
  );
}

const d = {
  wrap:          { padding: 16 },
  back:          { background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 },
  title:         { fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 },
  sub:           { fontSize: 13, color: '#6b7280', margin: 0 },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  statusBadge:   { padding: '4px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700 },
  advanceBtn:    { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  completeBtn:   { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  scanModeBtn:   { padding: '8px 16px', borderRadius: 8, border: '2px solid #d97706', background: '#fff', color: '#d97706', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  scanModeBtnActive: { background: '#d97706', color: '#fff' },
  scanPanel:     { background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '14px 16px', marginBottom: 16 },
  scanBinRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  scanBinLabel:  { fontSize: 14, color: '#374151', flex: 1 },
  scanClearBtn:  { padding: '3px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, color: '#6b7280', cursor: 'pointer' },
  scanInputRow:  { marginBottom: 8 },
  scanInput:     { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #f59e0b', fontSize: 14, background: '#fff', color: '#111827', boxSizing: 'border-box', outline: 'none' },
  scanFeedback:  { padding: '7px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600, marginBottom: 8 },
  scanHint:      { fontSize: 12, color: '#78716c', lineHeight: 1.5, margin: 0 },
  error:         { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:         { textAlign: 'center', padding: 40, color: '#6b7280' },
  tableWrap:     { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:         { width: '100%', borderCollapse: 'collapse', minWidth: 500 },
  thead:         { background: '#f9fafb' },
  th:            { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:           { borderBottom: '1px solid #f3f4f6' },
  rowEven:       { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:            { padding: '10px 12px', fontSize: 14, color: '#374151' },
  countInput:    { width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, textAlign: 'right' },
  uomSelect:     { padding: '5px 6px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, color: '#374151', background: '#f9fafb', cursor: 'pointer' },
  uncountedNote: { textAlign: 'center', fontSize: 13, color: '#d97706', fontWeight: 600, marginTop: 12 },
  locationHeader:{ fontSize: 13, fontWeight: 700, color: '#374151', padding: '8px 0 6px', borderBottom: '2px solid #e5e7eb', marginBottom: 4 },
  modalOverlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
  modal:         { background: '#fff', borderRadius: 14, padding: 28, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '80vh', overflowY: 'auto' },
  modalTitle:    { fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 12 },
  modalBody:     { fontSize: 14, color: '#374151', marginBottom: 12 },
  modalList:     { margin: '0 0 16px', paddingLeft: 20 },
  modalListItem: { fontSize: 14, color: '#374151', marginBottom: 4 },
  modalActions:  { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn:     { padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  confirmBtn:    { padding: '9px 20px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  rth:           { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  rtd:           { padding: '8px 10px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f3f4f6' },
};

const s = {
  wrap:          { padding: 16 },
  startCard:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 },
  startRow:      { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  typeSelect:    { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151', minWidth: 160 },
  filters:       { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  select:        { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151', flex: 1, minWidth: 140 },
  typeDesc:      { margin: '8px 0 0', fontSize: 13, color: '#6b7280' },
  startBtn:      { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  error:         { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:         { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:     { fontSize: 40, marginBottom: 12 },
  list:          { display: 'flex', flexDirection: 'column', gap: 10 },
  card:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s' },
  cardTop:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle:     { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 },
  cardMeta:      { fontSize: 12, color: '#6b7280' },
  cardProgress:  { display: 'flex', alignItems: 'center', gap: 12 },
  cardProgressText: { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' },
  progressBar:   { flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', background: '#2563eb', borderRadius: 3, transition: 'width 0.3s' },
  badge:         { display: 'inline-block', padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
};
