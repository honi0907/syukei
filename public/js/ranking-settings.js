/* 得点発表・ランキング表示の調整（設定ウィンドウ用） */
(function () {
    const socket = io();
    let localFontsLoaded = false;

    function buildDefaultFontList() {
        const fontSelect = document.getElementById('fontSelect');
        if (!fontSelect) return;
        fontSelect.innerHTML = `
            <optgroup label="システムフォント">
                <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">システム標準</option>
                <option value="'Arial', sans-serif">Arial</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="'Georgia', serif">Georgia</option>
                <option value="'Verdana', sans-serif">Verdana</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="'Impact', sans-serif">Impact</option>
                <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
            </optgroup>
            <optgroup label="日本語フォント">
                <option value="'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif">ヒラギノ角ゴ</option>
                <option value="'Yu Gothic', YuGothic, sans-serif">游ゴシック</option>
                <option value="'Meiryo', sans-serif">メイリオ</option>
                <option value="'MS PGothic', sans-serif">MS Pゴシック</option>
                <option value="'MS Gothic', monospace">MSゴシック</option>
                <option value="'Yu Mincho', 'YuMincho', serif">游明朝</option>
                <option value="'MS PMincho', serif">MS P明朝</option>
                <option value="'HGS創英角ｺﾞｼｯｸUB', sans-serif">創英角ゴシック</option>
            </optgroup>
            <optgroup label="デジタル・未来系">
                <option value="'Orbitron', sans-serif">Orbitron (デフォルト)</option>
                <option value="'Rajdhani', sans-serif">Rajdhani</option>
                <option value="'Michroma', sans-serif">Michroma</option>
                <option value="'Audiowide', cursive">Audiowide</option>
                <option value="'Electrolize', sans-serif">Electrolize</option>
                <option value="'Quantico', sans-serif">Quantico</option>
                <option value="'Chakra Petch', sans-serif">Chakra Petch</option>
                <option value="'Turret Road', cursive">Turret Road</option>
                <option value="'Sarpanch', sans-serif">Sarpanch</option>
                <option value="'Iceland', cursive">Iceland</option>
            </optgroup>
        `;
    }

    async function loadLocalFonts() {
        const btn = document.getElementById('loadLocalFontsBtn');
        if (!btn) return;

        if (!('queryLocalFonts' in window)) {
            btn.textContent = '❌ 非対応ブラウザ';
            btn.disabled = true;
            alert('このブラウザはLocal Font Access APIに対応していません。\nChrome/Edge 103以降をお使いください。');
            return;
        }

        try {
            btn.textContent = '読み込み中...';
            btn.disabled = true;

            const availableFonts = await window.queryLocalFonts();

            if (availableFonts.length === 0) {
                alert('フォントが見つかりませんでした。');
                btn.textContent = '💻 PCのフォントを読み込む';
                btn.disabled = false;
                return;
            }

            const fontFamilies = [...new Set(availableFonts.map((font) => font.family))].sort();
            const fontSelect = document.getElementById('fontSelect');
            const localGroup = document.createElement('optgroup');
            localGroup.label = '💻 ローカルフォント (' + fontFamilies.length + '種類)';

            fontFamilies.forEach((family) => {
                const option = document.createElement('option');
                option.value = `'${family}', sans-serif`;
                option.textContent = family;
                localGroup.appendChild(option);
            });

            fontSelect.insertBefore(localGroup, fontSelect.firstChild);

            btn.textContent = '✅ ' + fontFamilies.length + '個のフォントを読み込みました';
            localFontsLoaded = true;
        } catch (error) {
            console.error('フォント読み込みエラー:', error);
            if (error.name === 'NotAllowedError') {
                alert('フォントへのアクセスが拒否されました。');
            } else {
                alert('フォント読み込み中にエラーが発生しました: ' + error.message);
            }
            btn.textContent = '💻 PCのフォントを読み込む';
            btn.disabled = false;
        }
    }

    function changeFont() {
        const fontSelect = document.getElementById('fontSelect');
        const selectedFont = fontSelect.value;
        const preview = document.getElementById('fontPreview');
        if (preview) preview.style.fontFamily = selectedFont;
        localStorage.setItem('ranking_fontFamily', selectedFont);
        socket.emit('change-font', selectedFont);
    }

    function updateDigitSize(value) {
        document.getElementById('digitSizeValue').textContent = value;
        localStorage.setItem('ranking_digitSize', value);
        socket.emit('update-digit-size', { size: value });
    }

    function updateDigitGap(value) {
        document.getElementById('digitGapValue').textContent = value;
        localStorage.setItem('ranking_digitGap', value);
        socket.emit('update-digit-gap', { gap: value });
    }

    function updateCompanyNamePosition(value) {
        document.getElementById('companyNamePositionValue').textContent = value;
        localStorage.setItem('ranking_companyNamePosition', value);
        socket.emit('update-company-name-position', { position: value });
    }

    function updateScorePosition() {
        const top = document.getElementById('scoreTop').value;
        const left = document.getElementById('scoreLeft').value;
        document.getElementById('scoreTopValue').textContent = top;
        document.getElementById('scoreLeftValue').textContent = left;
        localStorage.setItem('ranking_scoreTop', top);
        localStorage.setItem('ranking_scoreLeft', left);
        socket.emit('update-score-position', { top, left });
    }

    function updateStopTiming() {
        const digit1 = parseFloat(document.getElementById('digit1StopTime').value) || 0;
        const digit2 = parseFloat(document.getElementById('digit2StopTime').value) || 2;
        localStorage.setItem('ranking_digit1StopTime', digit1);
        localStorage.setItem('ranking_digit2StopTime', digit2);
        socket.emit('update-stop-timing', {
            digit1: digit1 * 1000,
            digit2: digit2 * 1000
        });
    }

    function updatePerfectEffect() {
        const effect = document.getElementById('perfectEffect').value;
        localStorage.setItem('ranking_perfectEffect', effect);
        socket.emit('update-perfect-effect', { effect });
    }

    function updateDigitGradientColors() {
        const color1 = document.getElementById('digitGradientColor1').value;
        const color2 = document.getElementById('digitGradientColor2').value;
        const color3 = document.getElementById('digitGradientColor3').value;
        localStorage.setItem('ranking_digitGradientColor1', color1);
        localStorage.setItem('ranking_digitGradientColor2', color2);
        localStorage.setItem('ranking_digitGradientColor3', color3);
        socket.emit('update-digit-gradient-colors', { color1, color2, color3 });
    }

    function updateDigitShadowBlur(value) {
        document.getElementById('digitShadowBlurValue').textContent = value;
        localStorage.setItem('ranking_digitShadowBlur', value);
        socket.emit('update-digit-shadow-blur', { blur: parseInt(value, 10) });
    }

    function updateDigitShadowOpacity(value) {
        document.getElementById('digitShadowOpacityValue').textContent = value;
        localStorage.setItem('ranking_digitShadowOpacity', value);
        socket.emit('update-digit-shadow-opacity', { opacity: parseInt(value, 10) });
    }

    function updateCompanyGradientColors() {
        const color1 = document.getElementById('companyGradientColor1').value;
        const color2 = document.getElementById('companyGradientColor2').value;
        const color3 = document.getElementById('companyGradientColor3').value;
        localStorage.setItem('ranking_companyGradientColor1', color1);
        localStorage.setItem('ranking_companyGradientColor2', color2);
        localStorage.setItem('ranking_companyGradientColor3', color3);
        socket.emit('update-company-gradient-colors', { color1, color2, color3 });
    }

    function updateCompanyShadowBlur(value) {
        document.getElementById('companyShadowBlurValue').textContent = value;
        localStorage.setItem('ranking_companyShadowBlur', value);
        socket.emit('update-company-shadow-blur', { blur: parseInt(value, 10) });
    }

    function updateCompanyShadowOpacity(value) {
        document.getElementById('companyShadowOpacityValue').textContent = value;
        localStorage.setItem('ranking_companyShadowOpacity', value);
        socket.emit('update-company-shadow-opacity', { opacity: parseInt(value, 10) });
    }

    function restoreRankingSettings() {
        const digitSize = localStorage.getItem('ranking_digitSize') || '18';
        document.getElementById('digitSize').value = digitSize;
        document.getElementById('digitSizeValue').textContent = digitSize;

        const digitGap = localStorage.getItem('ranking_digitGap') || '15';
        document.getElementById('digitGap').value = digitGap;
        document.getElementById('digitGapValue').textContent = digitGap;

        const companyNamePosition = localStorage.getItem('ranking_companyNamePosition') || '20';
        document.getElementById('companyNamePosition').value = companyNamePosition;
        document.getElementById('companyNamePositionValue').textContent = companyNamePosition;

        const scoreTop = localStorage.getItem('ranking_scoreTop') || '50';
        const scoreLeft = localStorage.getItem('ranking_scoreLeft') || '50';
        document.getElementById('scoreTop').value = scoreTop;
        document.getElementById('scoreLeft').value = scoreLeft;
        document.getElementById('scoreTopValue').textContent = scoreTop;
        document.getElementById('scoreLeftValue').textContent = scoreLeft;

        const digit1StopTime = localStorage.getItem('ranking_digit1StopTime') || '11';
        const digit2StopTime = localStorage.getItem('ranking_digit2StopTime') || '13';
        document.getElementById('digit1StopTime').value = digit1StopTime;
        document.getElementById('digit2StopTime').value = digit2StopTime;

        const perfectEffect = localStorage.getItem('ranking_perfectEffect') || 'none';
        document.getElementById('perfectEffect').value = perfectEffect;

        document.getElementById('digitGradientColor1').value =
            localStorage.getItem('ranking_digitGradientColor1') || '#A8D5F7';
        document.getElementById('digitGradientColor2').value =
            localStorage.getItem('ranking_digitGradientColor2') || '#4A90D9';
        document.getElementById('digitGradientColor3').value =
            localStorage.getItem('ranking_digitGradientColor3') || '#0A2A47';

        const digitShadowBlur = localStorage.getItem('ranking_digitShadowBlur') || '15';
        const digitShadowOpacity = localStorage.getItem('ranking_digitShadowOpacity') || '30';
        document.getElementById('digitShadowBlur').value = digitShadowBlur;
        document.getElementById('digitShadowOpacity').value = digitShadowOpacity;
        document.getElementById('digitShadowBlurValue').textContent = digitShadowBlur;
        document.getElementById('digitShadowOpacityValue').textContent = digitShadowOpacity;

        document.getElementById('companyGradientColor1').value =
            localStorage.getItem('ranking_companyGradientColor1') || '#A8D5F7';
        document.getElementById('companyGradientColor2').value =
            localStorage.getItem('ranking_companyGradientColor2') || '#4A90D9';
        document.getElementById('companyGradientColor3').value =
            localStorage.getItem('ranking_companyGradientColor3') || '#0A2A47';

        const companyShadowBlur = localStorage.getItem('ranking_companyShadowBlur') || '15';
        const companyShadowOpacity = localStorage.getItem('ranking_companyShadowOpacity') || '30';
        document.getElementById('companyShadowBlur').value = companyShadowBlur;
        document.getElementById('companyShadowOpacity').value = companyShadowOpacity;
        document.getElementById('companyShadowBlurValue').textContent = companyShadowBlur;
        document.getElementById('companyShadowOpacityValue').textContent = companyShadowOpacity;

        const savedFont = localStorage.getItem('ranking_fontFamily');
        if (savedFont) {
            const fontSelect = document.getElementById('fontSelect');
            const option = [...fontSelect.options].find((o) => o.value === savedFont);
            if (option) fontSelect.value = savedFont;
            const preview = document.getElementById('fontPreview');
            if (preview) preview.style.fontFamily = savedFont;
        }
    }

    function pushStoredSettingsToServer() {
        const digitSize = localStorage.getItem('ranking_digitSize');
        if (digitSize) socket.emit('update-digit-size', { size: digitSize });

        const digitGap = localStorage.getItem('ranking_digitGap');
        if (digitGap) socket.emit('update-digit-gap', { gap: digitGap });

        const companyNamePosition = localStorage.getItem('ranking_companyNamePosition');
        if (companyNamePosition) {
            socket.emit('update-company-name-position', { position: companyNamePosition });
        }

        const scoreTop = localStorage.getItem('ranking_scoreTop');
        const scoreLeft = localStorage.getItem('ranking_scoreLeft');
        if (scoreTop && scoreLeft) socket.emit('update-score-position', { top: scoreTop, left: scoreLeft });

        const digit1StopTime = localStorage.getItem('ranking_digit1StopTime');
        const digit2StopTime = localStorage.getItem('ranking_digit2StopTime');
        if (digit1StopTime && digit2StopTime) {
            socket.emit('update-stop-timing', {
                digit1: parseFloat(digit1StopTime) * 1000,
                digit2: parseFloat(digit2StopTime) * 1000
            });
        }

        const perfectEffect = localStorage.getItem('ranking_perfectEffect');
        if (perfectEffect) socket.emit('update-perfect-effect', { effect: perfectEffect });

        const digitGradientColor1 = localStorage.getItem('ranking_digitGradientColor1');
        const digitGradientColor2 = localStorage.getItem('ranking_digitGradientColor2');
        const digitGradientColor3 = localStorage.getItem('ranking_digitGradientColor3');
        if (digitGradientColor1 && digitGradientColor2 && digitGradientColor3) {
            socket.emit('update-digit-gradient-colors', {
                color1: digitGradientColor1,
                color2: digitGradientColor2,
                color3: digitGradientColor3
            });
        }

        const digitShadowBlur = localStorage.getItem('ranking_digitShadowBlur');
        if (digitShadowBlur) socket.emit('update-digit-shadow-blur', { blur: parseInt(digitShadowBlur, 10) });

        const digitShadowOpacity = localStorage.getItem('ranking_digitShadowOpacity');
        if (digitShadowOpacity) {
            socket.emit('update-digit-shadow-opacity', { opacity: parseInt(digitShadowOpacity, 10) });
        }

        const companyGradientColor1 = localStorage.getItem('ranking_companyGradientColor1');
        const companyGradientColor2 = localStorage.getItem('ranking_companyGradientColor2');
        const companyGradientColor3 = localStorage.getItem('ranking_companyGradientColor3');
        if (companyGradientColor1 && companyGradientColor2 && companyGradientColor3) {
            socket.emit('update-company-gradient-colors', {
                color1: companyGradientColor1,
                color2: companyGradientColor2,
                color3: companyGradientColor3
            });
        }

        const companyShadowBlur = localStorage.getItem('ranking_companyShadowBlur');
        if (companyShadowBlur) {
            socket.emit('update-company-shadow-blur', { blur: parseInt(companyShadowBlur, 10) });
        }

        const companyShadowOpacity = localStorage.getItem('ranking_companyShadowOpacity');
        if (companyShadowOpacity) {
            socket.emit('update-company-shadow-opacity', { opacity: parseInt(companyShadowOpacity, 10) });
        }

        const savedFont = localStorage.getItem('ranking_fontFamily');
        if (savedFont) socket.emit('change-font', savedFont);
    }

    function initSettingsNav() {
        const navItems = document.querySelectorAll('.settings-nav-item');
        const panels = document.querySelectorAll('.settings-panel');

        navItems.forEach((item) => {
            item.addEventListener('click', () => {
                const target = item.dataset.panel;
                navItems.forEach((n) => n.classList.remove('active'));
                panels.forEach((p) => p.classList.remove('active'));
                item.classList.add('active');
                const panel = document.getElementById('panel-' + target);
                if (panel) panel.classList.add('active');
            });
        });
    }

    async function initAppInfo() {
        const appVersionEl = document.getElementById('appVersion');
        if (!appVersionEl) {
            return;
        }

        const desktopVersionEl = document.getElementById('desktopVersion');
        const updateStatusEl = document.getElementById('updateStatus');
        const installUpdateBtn = document.getElementById('installUpdateBtn');
        const updateProgressWrap = document.getElementById('updateProgressWrap');
        const updateProgressBar = document.getElementById('updateProgressBar');
        const updateProgressText = document.getElementById('updateProgressText');
        const hasDesktopUpdater = Boolean(window.syukeiDesktop?.checkForUpdate);

        try {
            const response = await fetch('/api/version', { cache: 'no-store' });
            const data = await response.json();
            appVersionEl.textContent = `v${data.version}`;
            appVersionEl.dataset.version = data.version;
        } catch {
            appVersionEl.textContent = '取得できませんでした';
        }

        if (window.syukeiDesktop?.getDesktopVersion) {
            try {
                const desktop = await window.syukeiDesktop.getDesktopVersion();
                desktopVersionEl.textContent = `${desktop.name || 'デスクトップ'} v${desktop.version}`;
                appVersionEl.dataset.desktopVersion = desktop.version;
            } catch {
                desktopVersionEl.textContent = '取得できませんでした';
            }
        } else {
            desktopVersionEl.textContent = 'ブラウザ表示';
        }

        function setInstallVisible(visible) {
            if (installUpdateBtn) {
                installUpdateBtn.hidden = !visible;
            }
        }

        function resetProgressUi() {
            if (updateProgressWrap) {
                updateProgressWrap.hidden = true;
            }
            if (updateProgressBar) {
                updateProgressBar.style.width = '0%';
            }
            if (updateProgressText) {
                updateProgressText.textContent = '0%';
            }
        }

        async function checkUpdates() {
            const btn = document.getElementById('checkUpdateBtn');
            if (!btn) {
                return;
            }

            btn.disabled = true;
            updateStatusEl.textContent = '更新情報を確認しています…';
            setInstallVisible(false);
            resetProgressUi();

            try {
                if (hasDesktopUpdater) {
                    const result = await window.syukeiDesktop.checkForUpdate();
                    if (result.status === 'update-available') {
                        updateStatusEl.textContent = `新しいバージョン v${result.latest} があります。「更新をダウンロードして再起動」で自動インストールできます。`;
                        setInstallVisible(true);
                    } else if (result.status === 'update-not-available') {
                        updateStatusEl.textContent = '現在のバージョンは最新です。';
                    } else if (result.status === 'dev') {
                        updateStatusEl.textContent = result.message || '開発モードではアプリ内更新は利用できません。';
                    } else {
                        updateStatusEl.textContent = result.message || '更新情報を取得できませんでした。';
                    }
                } else {
                    updateStatusEl.textContent =
                        'アプリ内更新はインストール版のデスクトップアプリから利用できます。';
                }
            } catch {
                updateStatusEl.textContent =
                    '更新情報を取得できませんでした。ネットワーク接続を確認してください。';
            } finally {
                btn.disabled = false;
            }
        }

        async function installUpdate() {
            if (!window.syukeiDesktop?.installUpdate) {
                return;
            }

            const checkBtn = document.getElementById('checkUpdateBtn');
            installUpdateBtn.disabled = true;
            if (checkBtn) {
                checkBtn.disabled = true;
            }
            updateStatusEl.textContent = '更新をダウンロードしています…';
            if (updateProgressWrap) {
                updateProgressWrap.hidden = false;
            }

            const removeProgressListener = window.syukeiDesktop.onUpdateProgress?.(({ percent }) => {
                if (updateProgressBar) {
                    updateProgressBar.style.width = `${percent}%`;
                }
                if (updateProgressText) {
                    updateProgressText.textContent = `${percent}%`;
                }
            });

            try {
                const result = await window.syukeiDesktop.installUpdate();
                if (result?.ok) {
                    updateStatusEl.textContent = 'インストールを開始しました。アプリを終了します…';
                } else {
                    updateStatusEl.textContent = result?.error || '更新のインストールに失敗しました。';
                    installUpdateBtn.disabled = false;
                    if (checkBtn) {
                        checkBtn.disabled = false;
                    }
                }
            } catch {
                updateStatusEl.textContent = '更新のインストールに失敗しました。';
                installUpdateBtn.disabled = false;
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
            } finally {
                removeProgressListener?.();
            }
        }

        document.getElementById('checkUpdateBtn')?.addEventListener('click', checkUpdates);
        installUpdateBtn?.addEventListener('click', installUpdate);
    }

    function bindControls() {
        window.updateDigitSize = updateDigitSize;
        window.updateDigitGap = updateDigitGap;
        window.updateCompanyNamePosition = updateCompanyNamePosition;
        window.updateScorePosition = updateScorePosition;
        window.updateStopTiming = updateStopTiming;
        window.updatePerfectEffect = updatePerfectEffect;
        window.updateDigitGradientColors = updateDigitGradientColors;
        window.updateDigitShadowBlur = updateDigitShadowBlur;
        window.updateDigitShadowOpacity = updateDigitShadowOpacity;
        window.updateCompanyGradientColors = updateCompanyGradientColors;
        window.updateCompanyShadowBlur = updateCompanyShadowBlur;
        window.updateCompanyShadowOpacity = updateCompanyShadowOpacity;
        window.changeFont = changeFont;

        const loadBtn = document.getElementById('loadLocalFontsBtn');
        if (loadBtn) loadBtn.addEventListener('click', loadLocalFonts);
    }

    function init() {
        buildDefaultFontList();
        bindControls();
        restoreRankingSettings();
        initSettingsNav();
        initAppInfo();

        socket.on('connect', () => {
            setTimeout(pushStoredSettingsToServer, 300);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
