/* sales.js */
let productsList  = [];
let warehousesList = [];
let currentPage   = 1;

(async () => {
    await requireLogin();
    const [{ data: products }, { data: warehouses }] = await Promise.all([
        apiFetch('/api/inventory'),
        apiFetch('/api/warehouse'),
        loadSales(),
        loadSummary()
    ]);
    productsList = products;
    warehousesList = warehouses || [];
    populateWarehouseSelect();

    document.getElementById('btnAdd').addEventListener('click',     openSaleModal);
    document.getElementById('modalClose').addEventListener('click',  closeSaleModal);
    document.getElementById('modalCancel').addEventListener('click', closeSaleModal);
    document.getElementById('modalSave').addEventListener('click',   saveSale);
    document.getElementById('btnAddItem').addEventListener('click',  addItemRow);
    document.getElementById('detailClose').addEventListener('click', () => document.getElementById('detailModal').classList.remove('show'));
    document.getElementById('btnSearch').addEventListener('click',   loadSales);
    document.getElementById('filterStatus').addEventListener('change', loadSales);
})();

function populateWarehouseSelect() {
    const sel = document.getElementById('fWarehouse');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Gudang --</option>' +
        warehousesList.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    // Auto-select first warehouse if only one exists
    if (warehousesList.length === 1) sel.value = warehousesList[0].id;
}

async function loadSummary() {
    try {
        const { grand } = await apiFetch('/api/sales/summary');
        document.getElementById('sumAll').textContent = formatRupiah(grand.total);
    } catch {}
}

async function loadSales(page = 1) {
    currentPage = page;
    const status = document.getElementById('filterStatus').value;
    let qs = `?page=${page}&limit=15`;
    if (status) qs += `&status=${status}`;
    try {
        const { data, total, limit } = await apiFetch(`/api/sales${qs}`);
        const tbody = document.getElementById('salesTable');
        tbody.innerHTML = data.length
            ? data.map(s => `
                <tr>
                  <td><strong>${s.invoice_number}</strong></td>
                  <td>${formatDate(s.date)}</td>
                  <td>${s.customer_name}</td>
                  <td class="text-right">${formatRupiah(s.total)}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="viewSale(${s.id})">👁</button>
                    <button class="btn btn-outline btn-sm" onclick="printNotaSale(${s.id})" title="Cetak Nota">🖨️</button>
                    <button class="btn btn-warning btn-sm" onclick="changeStatus(${s.id},'${s.status}')">🔄</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSale(${s.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#757575">Tidak ada data</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadSales(${page-1})">‹</button>`;
    for (let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" onclick="loadSales(${i})">${i}</button>`;
    html+=`<button ${page===pages?'disabled':''} onclick="loadSales(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function openSaleModal() {
    document.getElementById('fInvoice').value  = 'INV-' + Date.now();
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fCustomer').value = '';
    document.getElementById('fCustomerAddress').value = '';
    document.getElementById('fDiscount').value = 0;
    document.getElementById('fShipping').value = 0;
    document.getElementById('fStatus').value   = 'DRAFT';
    document.getElementById('fNotes').value    = '';
    document.getElementById('itemRows').innerHTML = '';
    document.getElementById('grandTotal').textContent = 'Rp 0';
    // Reset warehouse to default
    const whSel = document.getElementById('fWarehouse');
    if (whSel && warehousesList.length === 1) whSel.value = warehousesList[0].id;
    else if (whSel) whSel.value = '';
    addItemRow();
    document.getElementById('saleModal').classList.add('show');
}
function closeSaleModal() { document.getElementById('saleModal').classList.remove('show'); }

function productOptions() {
    return '<option value="">-- Pilih Produk --</option>' +
        productsList.map(p => {
            const sc = parseFloat(p.sell_content) || 1;
            const u = p.unit || 'kg';
            const su = p.sell_unit || 'pcs';
            const label = ` [${formatNum(sc)} ${u}/${su}]`;
            return `<option value="${p.id}" data-price="${p.sell_price}" data-sell-unit="${su}">${p.code} – ${p.name} (Stok: ${formatNum(p.stock)} ${u})${label}</option>`;
        }).join('');
}

function addItemRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select onchange="setPrice(this)">${productOptions()}</select></td>
      <td><input type="text" inputmode="decimal" value="1" oninput="this.value=this.value.replace(/,/g,'.');calcTotal()" style="width:80px"></td>
      <td><input type="number" min="0" value="0" oninput="calcTotal()"></td>
      <td class="text-right"><span>Rp 0</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();calcTotal()">✕</button></td>`;
    document.getElementById('itemRows').appendChild(tr);
}

function setPrice(sel) {
    const opt   = sel.options[sel.selectedIndex];
    const price = opt ? (parseFloat(opt.dataset.price) || 0) : 0;
    const row   = sel.closest('tr');
    row.querySelectorAll('input')[1].value = price;
    calcTotal();
}
window.setPrice = setPrice;

function calcTotal() {
    let subtotal = 0;
    document.querySelectorAll('#itemRows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input');
        const qty = parseFloat(String(inputs[0].value).replace(/,/g,'.')) || 0;
        const prc = parseFloat(inputs[1].value) || 0;
        const sub = qty * prc;
        tr.querySelector('span').textContent = formatRupiah(sub);
        subtotal += sub;
    });
    const discount  = parseFloat(document.getElementById('fDiscount').value) || 0;
    const shipping  = parseFloat(document.getElementById('fShipping').value) || 0;
    const total     = subtotal - discount + shipping;
    document.getElementById('grandTotal').textContent = formatRupiah(total);
}
window.calcTotal = calcTotal;

async function saveSale() {
    const invoice  = document.getElementById('fInvoice').value.trim();
    const date     = document.getElementById('fDate').value;
    const customer = document.getElementById('fCustomer').value.trim();
    const customer_address = document.getElementById('fCustomerAddress').value.trim();
    const discount  = parseFloat(document.getElementById('fDiscount').value) || 0;
    const shipping  = parseFloat(document.getElementById('fShipping').value) || 0;
    const status    = document.getElementById('fStatus').value;
    const notes     = document.getElementById('fNotes').value.trim();
    const warehouse_id = document.getElementById('fWarehouse')?.value || null;

    if (!invoice || !date || !customer) return showToast('Invoice, tanggal, dan pelanggan wajib diisi.', 'error');

    const rows  = document.querySelectorAll('#itemRows tr');
    const items = [];
    rows.forEach(tr => {
        const sel    = tr.querySelector('select');
        const inputs = tr.querySelectorAll('input');
        if (sel.value) items.push({ product_id: parseInt(sel.value), quantity: parseFloat(String(inputs[0].value).replace(/,/g,'.'))||1, unit_price: parseFloat(inputs[1].value)||0 });
    });
    if (!items.length) return showToast('Tambahkan minimal 1 item produk.', 'error');

    try {
        await apiFetch('/api/sales', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invoice_number: invoice, date, customer_name: customer, customer_address, channel: 'DIRECT', discount, shipping_cost: shipping, status, notes, items, warehouse_id: warehouse_id ? parseInt(warehouse_id) : null }) });
        showToast('Penjualan berhasil disimpan.');
        closeSaleModal();
        loadSales(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}

async function viewSale(id) {
    try {
        const { data } = await apiFetch(`/api/sales/${id}`);
        const itemRows = data.items.map(i => `<tr>
          <td>${i.product_code} – ${i.product_name}</td>
          <td class="text-right">${formatNum(i.quantity)}</td>
          <td class="text-right">${formatRupiah(i.unit_price)}</td>
          <td class="text-right">${formatRupiah(i.subtotal)}</td>
        </tr>`).join('');
        document.getElementById('detailContent').innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
            <div><strong>Invoice:</strong> ${data.invoice_number}</div>
            <div><strong>Tanggal:</strong> ${formatDate(data.date)}</div>
            <div><strong>Pelanggan:</strong> ${data.customer_name}</div>
            <div><strong>Alamat:</strong> ${data.customer_address || '-'}</div>
            <div><strong>Status:</strong> ${statusBadge(data.status)}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f7fa"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Harga</th><th style="padding:8px;text-align:right">Subtotal</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="text-align:right;margin-top:12px;font-size:13px">
            <div>Subtotal: ${formatRupiah(data.subtotal)}</div>
            <div>Diskon: -${formatRupiah(data.discount)}</div>
            <div>Ongkir: +${formatRupiah(data.shipping_cost)}</div>
            <div style="font-size:16px;font-weight:700;margin-top:6px">Total: ${formatRupiah(data.total)}</div>
          </div>
          <div style="text-align:center;margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="printNotaSale(${data.id})">🖨️ Cetak Nota</button>
          </div>`;
        document.getElementById('detailModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

async function printNotaSale(id) {
    try {
        const { data } = await apiFetch(`/api/sales/${id}`);
        const dateStr = new Date(data.date).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

        // Build item rows — minimum 8 rows for clean printed form
        const minRows = 8;
        let itemRows = '';
        data.items.forEach((item, i) => {
            itemRows += '<tr>'
                + '<td style="text-align:center">' + (i+1) + '</td>'
                + '<td>' + item.product_name + '</td>'
                + '<td style="text-align:center">' + formatNum(item.quantity) + '</td>'
                + '<td style="text-align:right">' + formatRupiah(item.unit_price) + '</td>'
                + '<td style="text-align:right">' + formatRupiah(item.subtotal) + '</td>'
                + '</tr>';
        });
        for (let i = data.items.length; i < minRows; i++) {
            itemRows += '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>';
        }

        const total = parseFloat(data.total) || 0;
        const dp = parseFloat(data.paid_amount || 0);
        const sisa = total - dp;

        // Check for custom nota header image
        let notaImgUrl = '';
        try {
            const nRes = await fetch('/api/nota-design/exists');
            const nData = await nRes.json();
            if (nData.exists) notaImgUrl = nData.url + '?t=' + Date.now();
        } catch(e) {}

        let headerHtml;
        if (notaImgUrl) {
            headerHtml = '<div class="kop">'
                + '<div class="kop-img"><img src="' + notaImgUrl + '"></div>'
                + '<div class="kop-right">'
                + '<div>Palembang, ' + dateStr + '</div>'
                + '<div>Kepada&nbsp;&nbsp;: <b>' + (data.customer_name || '-') + '</b></div>'
                + '<div>Alamat&nbsp;&nbsp;: ' + (data.customer_address || '') + '</div>'
                + '</div></div>';
        } else {
            headerHtml = '<div class="kop">'
                + '<div class="kop-logo"><img src="/api/logo" onerror="this.style.display=\'none\'"></div>'
                + '<div class="kop-center">'
                + '<h1>SAGARA</h1><h1>MEAT HOUSE</h1>'
                + '<div class="tagline">Menjual Berbagai Macam Frozen Food</div>'
                + '<div class="phone">\u260E 081196998881</div>'
                + '</div>'
                + '<div class="kop-right">'
                + '<div>Palembang, ' + dateStr + '</div>'
                + '<div>Kepada&nbsp;&nbsp;: <b>' + (data.customer_name || '-') + '</b></div>'
                + '<div>Alamat&nbsp;&nbsp;: ' + (data.customer_address || '') + '</div>'
                + '</div></div>';
        }

        // Footer — signature area (colspan 3) + summary (colspan 2)
        const footerRows = '<tr>'
            + '<td colspan="3" rowspan="3" style="vertical-align:bottom;padding:8px">'
            + '<div style="display:flex;justify-content:space-around;text-align:center;font-size:11px">'
            + '<div style="width:30%"><div>Penerima</div><div style="margin-top:50px;letter-spacing:1px">.....................</div></div>'
            + '<div style="width:30%"><div>Kurir</div><div style="margin-top:50px;letter-spacing:1px">.....................</div></div>'
            + '<div style="width:30%"><div>Hormat Kami</div><div style="margin-top:50px;font-weight:600">SAGARA Meat House</div></div>'
            + '</div></td>'
            + '<td style="text-align:center;font-weight:bold">Jumlah</td>'
            + '<td style="text-align:right;font-weight:bold">' + formatRupiah(total) + '</td>'
            + '</tr>'
            + '<tr>'
            + '<td style="text-align:center;font-weight:bold">DP</td>'
            + '<td style="text-align:right">' + (dp > 0 ? formatRupiah(dp) : '') + '</td>'
            + '</tr>'
            + '<tr>'
            + '<td style="text-align:center;font-weight:bold">Sisa</td>'
            + '<td style="text-align:right">' + (dp > 0 ? formatRupiah(sisa) : '') + '</td>'
            + '</tr>';

        const win = window.open('', '_blank', 'width=800,height=900');
        win.document.write('<!DOCTYPE html><html><head>'
            + '<title>Nota ' + data.invoice_number + '</title>'
            + '<style>'
            + '* { margin:0; padding:0; box-sizing:border-box; }'
            + 'body { font-family:Arial,sans-serif; padding:20px; font-size:12px; color:#333; }'
            + '.kop { display:flex; align-items:flex-start; margin-bottom:14px; gap:12px; }'
            + '.kop-logo { width:120px; min-width:120px; }'
            + '.kop-logo img { max-width:110px; max-height:95px; }'
            + '.kop-img { flex:1; }'
            + '.kop-img img { max-width:100%; max-height:140px; }'
            + '.kop-center { flex:1; text-align:center; }'
            + '.kop-center h1 { color:#8B0000; font-size:22px; font-family:Georgia,serif; line-height:1.2; margin:0; }'
            + '.kop-center .tagline { font-style:italic; font-weight:bold; font-size:11px; margin-top:4px; }'
            + '.kop-center .phone { font-size:11px; margin-top:2px; }'
            + '.kop-right { min-width:210px; font-size:12px; line-height:1.8; text-align:left; }'
            + 'table { width:100%; border-collapse:collapse; }'
            + 'th, td { border:1px solid #333; padding:5px 6px; font-size:11px; }'
            + 'th { background:#f5f5f5; font-weight:bold; text-align:center; font-size:11px; }'
            + '@media print { body { padding:10px; } .no-print { display:none !important; } }'
            + '</style></head><body>'
            + headerHtml
            + '<table>'
            + '<thead><tr>'
            + '<th style="width:40px">NO</th>'
            + '<th>NAMA BARANG</th>'
            + '<th style="width:65px">QTY</th>'
            + '<th style="width:120px">HARGA SATUAN</th>'
            + '<th style="width:120px">JUMLAH</th>'
            + '</tr></thead>'
            + '<tbody>' + itemRows + footerRows + '</tbody>'
            + '</table>'
            + '<div class="no-print" style="text-align:center;margin-top:20px">'
            + '<button onclick="window.print()" style="padding:10px 24px;background:#1a237e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">🖨️ Cetak</button>'
            + ' <button onclick="window.close()" style="padding:10px 24px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin-left:8px">Tutup</button>'
            + '</div>'
            + '<script>window.onload=function(){window.print();}<\/script>'
            + '</body></html>');
        win.document.close();
    } catch (e) {
        showToast('Gagal mencetak nota: ' + e.message, 'error');
    }
}
window.printNotaSale = printNotaSale;

async function changeStatus(id, currentStatus) {
    const statuses = ['DRAFT','CONFIRMED','SHIPPED','DONE','CANCELLED'];
    const next = prompt(`Status saat ini: ${currentStatus}\nPilih status baru:\n${statuses.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nMasukkan nomor:`);
    const idx = parseInt(next) - 1;
    if (isNaN(idx) || !statuses[idx]) return;
    try {
        await apiFetch(`/api/sales/${id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: statuses[idx] }) });
        showToast('Status diperbarui.');
        loadSales(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteSale(id) {
    if (!await confirmDialog('Hapus penjualan ini? Stok akan dikembalikan.')) return;
    try {
        await apiFetch(`/api/sales/${id}`, { method:'DELETE' });
        showToast('Penjualan dihapus.', 'warning');
        loadSales(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}
