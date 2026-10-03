const JSON_URL = "https://raw.githubusercontent.com/srhady/willow-event/refs/heads/main/live_sports.json";

let globalMatches = [];
let art = null;
let activeHls = null;
let shakaPlayer = null;

let currentMatchStreams = [];
let currentServerIndex = 0;
let isSwitchingServer = false;

let currentMatchId = null;
let matchesRefreshTimer = null;

const MATCH_REFRESH_TIME = 30000;


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    if (window.shaka) {
        shaka.polyfill.installAll();
    }

    fetchMatches();

    // Refresh match status/data every 30 seconds.
    // It does NOT reload or recreate the player.
    matchesRefreshTimer = setInterval(() => {

        if (!document.hidden) {
            refreshMatchData();
        }

    }, MATCH_REFRESH_TIME);


    setupTelegramEvents();
    setupSearch();

});


/* =========================================================
   FETCH MATCHES
========================================================= */

async function fetchMatches() {

    try {

        const response = await fetch(
            `${JSON_URL}?_=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        globalMatches = Array.isArray(data.Matches)
            ? data.Matches
            : [];

        renderMatches();

    } catch (error) {

        console.error("Error fetching match JSON:", error);

        const liveGrid =
            document.getElementById("live-matches-grid");

        const upcomingGrid =
            document.getElementById("upcoming-matches-grid");

        const scheduleGrid =
            document.getElementById("schedule-matches-grid");

        if (liveGrid) {
            liveGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>

                    <h3>Unable to load live matches</h3>

                    <p>
                        Please refresh the page and try again.
                    </p>
                </div>
            `;
        }

        if (upcomingGrid) {
            upcomingGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fa-solid fa-clock"></i>
                    </div>

                    <h3>Upcoming matches unavailable</h3>

                    <p>
                        Match data could not be loaded right now.
                    </p>
                </div>
            `;
        }

        if (scheduleGrid) {
            scheduleGrid.innerHTML = "";
        }

    }

}


/* =========================================================
   REFRESH DATA
========================================================= */

async function refreshMatchData() {

    try {

        const response = await fetch(
            `${JSON_URL}?_=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        const newMatches = Array.isArray(data.Matches)
            ? data.Matches
            : [];

        const oldMatches = globalMatches;

        globalMatches = newMatches;

        /*
         * If the user is currently watching a match,
         * DO NOT touch/recreate the player.
         *
         * This prevents the live stream from stopping
         * every time the JSON refreshes.
         */
        if (currentMatchId) {

            const currentMatch =
                globalMatches.find(
                    m => String(m.match_id) === String(currentMatchId)
                );

            if (currentMatch) {

                const currentStatus =
                    normalizeStatus(currentMatch.status);

                /*
                 * If current match is still LIVE,
                 * keep player exactly as it is.
                 */
                if (currentStatus === "LIVE") {

                    updateCurrentPlayerInfo(currentMatch);

                    return;

                }

            }

        }


        /*
         * Normal homepage refresh.
         */
        if (
            document.getElementById("home-section") &&
            document.getElementById("home-section").style.display !== "none"
        ) {

            renderMatches();

        }


        /*
         * If match status changed from UPCOMING -> LIVE,
         * update details page.
         */
        if (
            document.getElementById("match-details-section") &&
            document.getElementById("match-details-section").style.display !== "none" &&
            currentMatchId
        ) {

            const match =
                globalMatches.find(
                    m => String(m.match_id) === String(currentMatchId)
                );

            if (match) {
                updateDetailsPage(match);
            }

        }

    } catch (error) {

        console.warn(
            "Background match refresh failed:",
            error
        );

    }

}


/* =========================================================
   STATUS NORMALIZATION
========================================================= */

function normalizeStatus(status) {

    return String(status || "")
        .trim()
        .toUpperCase();

}


function isLiveMatch(match) {

    if (!match) {
        return false;
    }

    return normalizeStatus(match.status) === "LIVE";

}


/* =========================================================
   RENDER ALL MATCHES
========================================================= */

function renderMatches() {

    const liveGrid =
        document.getElementById("live-matches-grid");

    const upcomingGrid =
        document.getElementById("upcoming-matches-grid");

    const scheduleGrid =
        document.getElementById("schedule-matches-grid");


    if (!liveGrid || !upcomingGrid || !scheduleGrid) {
        console.error(
            "Required match grid elements are missing."
        );
        return;
    }


    liveGrid.innerHTML = "";
    upcomingGrid.innerHTML = "";
    scheduleGrid.innerHTML = "";


    /*
     * IMPORTANT:
     *
     * Only exact LIVE status goes into LIVE.
     * Everything else goes into UPCOMING.
     */
    const liveList = globalMatches.filter(
        match => isLiveMatch(match)
    );


    const upcomingList = globalMatches.filter(
        match => !isLiveMatch(match)
    );


    /* =====================================================
       LIVE
    ====================================================== */

    if (liveList.length === 0) {

        liveGrid.innerHTML = `
            <div class="empty-state live-empty">
                <div class="empty-icon">
                    <i class="fa-solid fa-satellite-dish"></i>
                </div>

                <h3>No Live Matches Right Now</h3>

                <p>
                    Live matches will appear here automatically
                    when they go LIVE.
                </p>
            </div>
        `;

    } else {

        liveList.forEach(match => {

            liveGrid.appendChild(
                createMatchCard(match, "LIVE")
            );

        });

    }


    /* =====================================================
       UPCOMING
    ====================================================== */

    if (upcomingList.length === 0) {

        upcomingGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fa-regular fa-calendar"></i>
                </div>

                <h3>No Upcoming Matches</h3>

                <p>
                    New events will appear here automatically.
                </p>
            </div>
        `;

    } else {

        upcomingList.forEach(match => {

            upcomingGrid.appendChild(
                createMatchCard(match, "UPCOMING")
            );

            scheduleGrid.appendChild(
                createScheduleCard(match)
            );

        });

    }


    /* =====================================================
       COUNTERS
    ====================================================== */

    updateCounter(
        "live-count",
        liveList.length
    );

    updateCounter(
        "upcoming-count",
        upcomingList.length
    );

}


/* =========================================================
   COUNTER
========================================================= */

function updateCounter(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.innerText = value;
    }

}


/* =========================================================
   MATCH CARD
========================================================= */

function createMatchCard(match, type) {

    const card =
        document.createElement("div");

    card.className =
        "match-card";


    const live =
        type === "LIVE";


    card.onclick = () => {

        showMatchDetails(match.match_id);

    };


    const statusBadge = live
        ? `
            <span class="card-badge live-badge">
                <span class="badge-dot"></span>
                LIVE
            </span>
        `
        : `
            <span class="card-badge upcoming-badge">
                <i class="fa-regular fa-clock"></i>
                UPCOMING
            </span>
        `;


    card.innerHTML = `

        <div class="card-banner">

            <img
                src="${escapeHtml(match.cover_image || "")}"
                alt="${escapeHtml(match.title || "Match")}"
                loading="lazy"
                onerror="
                    this.src='https://via.placeholder.com/600x337?text=Criczone'
                "
            >

            ${statusBadge}

            ${
                live
                    ? `
                        <div class="card-watch-overlay">
                            <span>
                                <i class="fa-solid fa-play"></i>
                                WATCH LIVE
                            </span>
                        </div>
                    `
                    : ""
            }

        </div>


        <div class="card-content">

            <div class="card-status-line">

                ${
                    live
                        ? `
                            <span class="mini-live">
                                <span></span>
                                LIVE NOW
                            </span>
                        `
                        : `
                            <span class="mini-upcoming">
                                <i class="fa-regular fa-clock"></i>
                                UPCOMING
                            </span>
                        `
                }

            </div>


            <h3 class="card-title">
                ${escapeHtml(match.title || "Untitled Match")}
            </h3>


            <p class="card-sub">
                CRICZONE HD NETWORK
            </p>


            <div class="card-bottom">

                ${
                    live
                        ? `
                            <span class="card-action live-action">
                                WATCH LIVE
                                <i class="fa-solid fa-arrow-right"></i>
                            </span>
                        `
                        : `
                            <span class="card-action upcoming-action">
                                VIEW DETAILS
                                <i class="fa-solid fa-arrow-right"></i>
                            </span>
                        `
                }

            </div>

        </div>

    `;


    return card;

}


/* =========================================================
   SCHEDULE CARD
========================================================= */

function createScheduleCard(match) {

    const card =
        document.createElement("div");

    card.className =
        "schedule-card";


    const live =
        isLiveMatch(match);


    card.onclick = () => {

        showMatchDetails(match.match_id);

    };


    card.innerHTML = `

        <div class="schedule-card-top">

            <span class="schedule-status ${
                live
                    ? "schedule-live"
                    : "schedule-upcoming"
            }">

                ${
                    live
                        ? `
                            <span class="badge-dot"></span>
                            LIVE
                        `
                        : `
                            <i class="fa-regular fa-clock"></i>
                            UPCOMING
                        `
                }

            </span>

        </div>


        <div class="schedule-card-body">

            <div class="schedule-icon">

                ${
                    live
                        ? `<i class="fa-solid fa-play"></i>`
                        : `<i class="fa-regular fa-calendar"></i>`
                }

            </div>


            <div class="schedule-info">

                <h3>
                    ${escapeHtml(match.title || "Match")}
                </h3>

                <p>
                    CRICZONE HD NETWORK
                </p>

            </div>


            <i class="fa-solid fa-chevron-right schedule-arrow"></i>

        </div>

    `;


    return card;

}


/* =========================================================
   MATCH DETAILS
========================================================= */

function showMatchDetails(matchId) {

    const match =
        globalMatches.find(
            m => String(m.match_id) === String(matchId)
        );


    if (!match) {
        return;
    }


    currentMatchId =
        match.match_id;


    destroyPlayers();


    document.getElementById("home-section").style.display =
        "none";

    document.getElementById("player-section").style.display =
        "none";


    const detailsSec =
        document.getElementById(
            "match-details-section"
        );


    detailsSec.style.display =
        "block";


    updateDetailsPage(match);

}


/* =========================================================
   UPDATE DETAILS PAGE
========================================================= */

function updateDetailsPage(match) {

    const live =
        isLiveMatch(match);


    const image =
        document.getElementById(
            "detail-banner-img"
        );


    const title =
        document.getElementById(
            "detail-match-title"
        );


    const sub =
        document.getElementById(
            "detail-match-sub"
        );


    const watchBtn =
        document.getElementById(
            "detail-watch-btn"
        );


    const statusBadge =
        document.getElementById(
            "detail-status-badge"
        );


    if (image) {

        image.src =
            match.cover_image || "";

    }


    if (title) {

        title.innerText =
            match.title || "Match";

    }


    if (sub) {

        sub.innerText =
            live
                ? "LIVE • CRICZONE HD NETWORK"
                : "UPCOMING • CRICZONE HD NETWORK";

    }


    /* =====================================================
       LIVE
    ====================================================== */

    if (live) {

        if (statusBadge) {

            statusBadge.className =
                "detail-status-badge detail-live";

            statusBadge.innerHTML = `
                <span class="badge-dot"></span>
                LIVE NOW
            `;

        }


        if (watchBtn) {

            watchBtn.style.display =
                "inline-flex";

            watchBtn.innerHTML = `
                <i class="fa-solid fa-play"></i>
                WATCH LIVE
            `;

            watchBtn.onclick = () => {

                openMatchPlayer(
                    match.match_id
                );

            };

        }

    }


    /* =====================================================
       UPCOMING
    ====================================================== */

    else {

        if (statusBadge) {

            statusBadge.className =
                "detail-status-badge detail-upcoming";

            statusBadge.innerHTML = `
                <i class="fa-regular fa-clock"></i>
                UPCOMING
            `;

        }


        if (watchBtn) {

            /*
             * Important:
             * Upcoming matches NEVER open player.
             */

            watchBtn.style.display =
                "none";

            watchBtn.onclick =
                null;

        }

    }

}


/* =========================================================
   OPEN PLAYER
========================================================= */

function openMatchPlayer(matchId) {

    const match =
        globalMatches.find(
            m => String(m.match_id) === String(matchId)
        );


    if (!match) {
        return;
    }


    /*
     * HARD PROTECTION:
     *
     * Upcoming match cannot open the player.
     */
    if (!isLiveMatch(match)) {

        console.warn(
            "Player blocked: match is not LIVE."
        );

        showMatchDetails(matchId);

        return;

    }


    currentMatchId =
        match.match_id;


    document.getElementById("home-section").style.display =
        "none";

    document.getElementById("match-details-section").style.display =
        "none";

    document.getElementById("player-section").style.display =
        "block";


    const title =
        document.getElementById(
            "active-match-title"
        );


    if (title) {

        title.innerText =
            match.title || "Live Match";

    }


    const subtitle =
        document.getElementById(
            "active-match-sub"
        );


    if (subtitle) {

        subtitle.innerText =
            "LIVE • CRICZONE HD NETWORK";

    }


    /*
     * Reset ONLY when opening a new match.
     */
    currentMatchStreams = [];
    currentServerIndex = 0;
    isSwitchingServer = false;


    const drmKey =
        match.drm_key || null;


    let serverCounter = 1;


    /*
     * TYPE-SAFE STREAM EXTRACTION.
     *
     * ORIGINAL STREAM STRUCTURE PRESERVED.
     *
     * Object => each key is a named server.
     * String => the whole value is ONE single stream URL.
     *
     * null / undefined / empty / non-string values are ignored.
     */
    const pushStream = (
        label,
        streamUrl
    ) => {

        if (typeof streamUrl !== "string") {
            return;
        }


        const safeUrl =
            streamUrl.trim();


        if (!safeUrl) {
            return;
        }


        currentMatchStreams.push({

            label:
                label || `Server ${serverCounter}`,

            url:
                safeUrl,

            drmKey:
                drmKey

        });


        serverCounter++;

    };


    [
        "stream_url_alpha",
        "stream_url_bravo",
        "stream_url"
    ].forEach(key => {

        const streamValue =
            match[key];


        if (!streamValue) {
            return;
        }


        /*
         * Object => named servers (real JSON names preserved).
         */

        if (typeof streamValue === "object") {

            Object.keys(streamValue).forEach(
                serverName => {

                    pushStream(
                        serverName,
                        streamValue[serverName]
                    );

                }
            );

            return;

        }


        /*
         * String => a single stream URL.
         */

        if (typeof streamValue === "string") {

            pushStream(
                "",
                streamValue
            );

        }

    });


    renderServerDropdown();


    if (currentMatchStreams.length > 0) {

        initArtPlayer(
            currentMatchStreams[0].url,
            currentMatchStreams[0].drmKey
        );

    } else {

        console.warn(
            "No stream servers available for this LIVE match."
        );

        showPlayerNotice(
            "No live stream server is available right now."
        );

    }

}


/* =========================================================
   SERVER DROPDOWN
========================================================= */

function renderServerDropdown() {

    const navActions =
        document.getElementById(
            "nav-actions-container"
        );


    if (!navActions) {
        return;
    }


    navActions.innerHTML = "";


    if (currentMatchStreams.length === 0) {

        const closeBtn =
            createCloseButton();

        navActions.appendChild(
            closeBtn
        );

        return;

    }


    const select =
        document.createElement("select");


    select.className =
        "server-select";


    select.id =
        "server-select-dropdown";


    currentMatchStreams.forEach(
        (srv, index) => {

            const opt =
                document.createElement("option");


            opt.value =
                index;


            opt.innerText =
                srv.label;


            if (
                index ===
                currentServerIndex
            ) {

                opt.selected =
                    true;

            }


            select.appendChild(
                opt
            );

        }
    );


    select.onchange =
        event => {

            const selectedIndex =
                parseInt(
                    event.target.value,
                    10
                );


            if (
                Number.isNaN(
                    selectedIndex
                )
            ) {
                return;
            }


            currentServerIndex =
                selectedIndex;


            const server =
                currentMatchStreams[
                    currentServerIndex
                ];


            if (!server) {
                return;
            }


            initArtPlayer(
                server.url,
                server.drmKey
            );

        };


    navActions.appendChild(
        select
    );


    navActions.appendChild(
        createCloseButton()
    );

}


/* =========================================================
   CLOSE BUTTON
========================================================= */

function createCloseButton() {

    const closeBtn =
        document.createElement("button");


    closeBtn.className =
        "close-btn";


    closeBtn.type =
        "button";


    closeBtn.innerHTML =
        `<i class="fa-solid fa-xmark"></i> CLOSE`;


    closeBtn.onclick =
        () => {

            showHome();

        };


    return closeBtn;

}


/* =========================================================
   AUTOPLAY (NON-DESTRUCTIVE)

   A rejected video.play() promise means the browser blocked
   autoplay (policy / no user gesture).
   It is NOT a dead stream and NOT a dead server.

   So we never destroy the player and we never switch server
   for it - the stream simply waits for the manual Play press.
========================================================= */

function attemptAutoplay(video) {

    if (!video) {
        return;
    }


    let playPromise =
        null;


    try {

        playPromise =
            video.play();

    } catch (error) {

        console.warn(
            "[CricZone Player] Autoplay blocked - waiting for user interaction",
            error
        );

        showAutoplayHint();

        return;

    }


    if (
        !playPromise ||
        typeof playPromise.catch !== "function"
    ) {
        return;
    }


    playPromise.catch(error => {

        console.warn(
            "[CricZone Player] Autoplay blocked - waiting for user interaction",
            error
        );

        showAutoplayHint();

    });

}


/*
 * Small hint only.
 * Player, stream, server list and selected server stay as is.
 */

function showAutoplayHint() {

    if (art && art.notice) {

        art.notice.show =
            "Press Play to start";

    }

}


/* =========================================================
   SERVER FALLBACK
========================================================= */

function tryNextServer(
    reason = "Playback Error"
) {

    if (isSwitchingServer) {
        return;
    }


    isSwitchingServer =
        true;


    if (
        currentServerIndex + 1 <
        currentMatchStreams.length
    ) {

        currentServerIndex++;


        const nextServer =
            currentMatchStreams[
                currentServerIndex
            ];


        console.warn(
            "[CricZone Player] Genuine stream failure - switching server",
            reason
        );


        console.warn(
            `[CricZone Player] Switching server: ${nextServer.label}`
        );


        const dropdown =
            document.getElementById(
                "server-select-dropdown"
            );


        if (dropdown) {

            dropdown.value =
                currentServerIndex;

        }


        initArtPlayer(
            nextServer.url,
            nextServer.drmKey
        );


    } else {

        console.error(
            "[CricZone Player] All available servers failed to stream."
        );


        if (art) {

            art.notice.show =
                "All servers are offline or unreachable.";

        }

    }

}


/* =========================================================
   DESTROY PLAYERS
========================================================= */

async function destroyPlayers() {

    if (art) {

        try {
            art.destroy(true);
        } catch (e) {
            console.warn(
                "Artplayer destroy error:",
                e
            );
        }

        art = null;

    }


    if (activeHls) {

        try {
            activeHls.destroy();
        } catch (e) {
            console.warn(
                "HLS destroy error:",
                e
            );
        }

        activeHls = null;

    }


    if (shakaPlayer) {

        try {
            await shakaPlayer.destroy();
        } catch (e) {
            console.warn(
                "Shaka destroy error:",
                e
            );
        }

        shakaPlayer = null;

    }

}


/* =========================================================
   ARTPLAYER
========================================================= */

async function initArtPlayer(
    url,
    drmKey = null
) {

    if (!url) {
        return;
    }


    await destroyPlayers();


    isSwitchingServer =
        false;


    const isDash =
        url.includes(".mpd");


    const type =
        isDash
            ? "mpd"
            : "m3u8";


    art =
        new Artplayer({

            container:
                "#artplayer",

            url:
                url,

            type:
                type,

            autoplay:
                true,

            isLive:
                true,

            fullscreen:
                true,

            fullscreenWeb:
                true,

            pip:
                true,

            setting:
                true,

            theme:
                "#ccff00",


            customType: {

                /* =================================================
                   HLS
                ================================================== */

                m3u8:
                    function(video, streamUrl) {

                        if (
                            Hls.isSupported()
                        ) {

                            /*
                             * Never attach a second HLS instance.
                             */

                            if (activeHls) {

                                try {
                                    activeHls.destroy();
                                } catch (e) {
                                    console.warn(
                                        "[CricZone Player] Previous HLS destroy error:",
                                        e
                                    );
                                }

                                activeHls = null;

                            }


                            const hls =
                                new Hls({

                                    enableWorker:
                                        true,

                                    lowLatencyMode:
                                        true,

                                    backBufferLength:
                                        30

                                });


                            activeHls =
                                hls;


                            hls.loadSource(
                                streamUrl
                            );


                            hls.attachMedia(
                                video
                            );


                            hls.on(
                                Hls.Events.MANIFEST_PARSED,
                                function() {

                                    console.log(
                                        "[CricZone Player] Stream loaded"
                                    );


                                    attemptAutoplay(
                                        video
                                    );


                                    if (
                                        hls.levels &&
                                        hls.levels.length > 0
                                    ) {

                                        const qualityOptions =
                                            hls.levels.map(
                                                (level, index) => ({

                                                    html:
                                                        level.height
                                                            ? `${level.height}p`
                                                            : `Level ${index + 1}`,

                                                    level:
                                                        index,

                                                    default:
                                                        index ===
                                                        hls.currentLevel

                                                })
                                            );


                                        qualityOptions.unshift({

                                            html:
                                                "Auto",

                                            level:
                                                -1,

                                            default:
                                                hls.currentLevel === -1

                                        });


                                        if (art) {

                                            art.setting.add({

                                                html:
                                                    "Quality",

                                                name:
                                                    "quality",

                                                tooltip:
                                                    "Auto",

                                                selector:
                                                    qualityOptions,

                                                onSelect:
                                                    function(item) {

                                                        hls.currentLevel =
                                                            item.level;

                                                        return item.html;

                                                    }

                                            });

                                        }

                                    }

                                }
                            );


                            hls.on(
                                Hls.Events.ERROR,
                                function(event, data) {

                                    if (
                                        data.fatal
                                    ) {

                                        tryNextServer(
                                            `HLS Fatal Error (${data.type})`
                                        );

                                    }

                                }
                            );


                        }

                        else if (
                            video.canPlayType(
                                "application/vnd.apple.mpegurl"
                            )
                        ) {

                            video.src =
                                streamUrl;


                            video.onerror =
                                () => {

                                    tryNextServer(
                                        "Native HLS Error"
                                    );

                                };

                        }

                    },


                /* =================================================
                   MPEG-DASH / SHAKA
                ================================================== */

                mpd:
                    async function(video, streamUrl) {

                        if (
                            !window.shaka ||
                            !shaka.Player.isBrowserSupported()
                        ) {

                            console.error(
                                "[CricZone Player] Shaka Player is not supported."
                            );

                            return;

                        }


                        /*
                         * Never create a second Shaka instance on
                         * the same video element.
                         */

                        if (shakaPlayer) {

                            try {
                                await shakaPlayer.destroy();
                            } catch (e) {
                                console.warn(
                                    "[CricZone Player] Previous Shaka destroy error:",
                                    e
                                );
                            }

                            shakaPlayer = null;

                        }


                        const player =
                            new shaka.Player(
                                video
                            );


                        shakaPlayer =
                            player;


                        player.configure({

                            streaming: {

                                rebufferingGoal:
                                    2,

                                bufferingGoal:
                                    10,

                                bufferBehind:
                                    15,

                                retryParameters: {

                                    maxAttempts:
                                        3,

                                    baseDelay:
                                        1000,

                                    backoffFactor:
                                        2

                                },

                                lowLatencyMode:
                                    true,

                                autoLowLatencyMode:
                                    true

                            }

                        });


                        /*
                         * Original ClearKey logic preserved.
                         */
                        if (
                            drmKey &&
                            drmKey.includes(":")
                        ) {

                            const [
                                keyId,
                                key
                            ] =
                                drmKey.split(":");


                            const clearkeys =
                                {};


                            clearkeys[keyId] =
                                key;


                            player.configure({

                                drm: {

                                    clearKeys:
                                        clearkeys

                                }

                            });

                        }


                        player.addEventListener(
                            "error",
                            () => {

                                tryNextServer(
                                    "Shaka Player Streaming Error"
                                );

                            }
                        );


                        try {

                            await player.load(
                                streamUrl
                            );


                            console.log(
                                "[CricZone Player] Stream loaded"
                            );


                            attemptAutoplay(
                                video
                            );


                            const tracks =
                                player.getVariantTracks();


                            if (
                                tracks &&
                                tracks.length > 0
                            ) {

                                const uniqueTracks =
                                    [];


                                const seenHeights =
                                    new Set();


                                tracks.forEach(
                                    track => {

                                        if (
                                            track.height &&
                                            !seenHeights.has(
                                                track.height
                                            )
                                        ) {

                                            seenHeights.add(
                                                track.height
                                            );


                                            uniqueTracks.push(
                                                track
                                            );

                                        }

                                    }
                                );


                                uniqueTracks.sort(
                                    (a, b) =>
                                        b.height -
                                        a.height
                                );


                                const qualityOptions =
                                    uniqueTracks.map(
                                        track => ({

                                            html:
                                                `${track.height}p`,

                                            id:
                                                track.id

                                        })
                                    );


                                qualityOptions.unshift({

                                    html:
                                        "Auto",

                                    id:
                                        -1

                                });


                                if (art) {

                                    art.setting.add({

                                        html:
                                            "Quality",

                                        name:
                                            "quality",

                                        tooltip:
                                            "Auto",

                                        selector:
                                            qualityOptions,

                                        onSelect:
                                            function(item) {

                                                if (
                                                    item.id === -1
                                                ) {

                                                    player.configure({

                                                        abr: {

                                                            enabled:
                                                                true

                                                        }

                                                    });

                                                }

                                                else {

                                                    player.configure({

                                                        abr: {

                                                            enabled:
                                                                false

                                                        }

                                                    });


                                                    const selectedTrack =
                                                        tracks.find(
                                                            t =>
                                                                t.id ===
                                                                item.id
                                                        );


                                                    if (
                                                        selectedTrack
                                                    ) {

                                                        player.selectVariantTrack(
                                                            selectedTrack,
                                                            true
                                                        );

                                                    }

                                                }


                                                return item.html;

                                            }

                                    });

                                }

                            }


                        }

                        catch (error) {

                            console.error(
                                "Shaka load error:",
                                error
                            );


                            tryNextServer(
                                "Shaka DRM / Load Error"
                            );

                        }

                    }

            }

        });


    /*
     * Artplayer emits "error" on every one of its own
     * reconnect attempts, so a single error event is NOT
     * proof of a dead server.
     *
     * Genuine failures are still handled by:
     *   player.load() rejection
     *   unrecoverable Shaka errors
     *   fatal HLS errors
     */

    art.on(
        "error",
        (event, reconnectCount) => {

            if (
                reconnectCount === 1 ||
                reconnectCount == null
            ) {

                console.warn(
                    "[CricZone Player] Artplayer error (own reconnect) - keeping current server"
                );

            }

        }
    );

}


/* =========================================================
   UPDATE CURRENT PLAYER INFO
========================================================= */

function updateCurrentPlayerInfo(match) {

    const title =
        document.getElementById(
            "active-match-title"
        );


    const sub =
        document.getElementById(
            "active-match-sub"
        );


    if (title) {

        title.innerText =
            match.title || "Live Match";

    }


    if (sub) {

        sub.innerText =
            "LIVE • CRICZONE HD NETWORK";

    }

}


/* =========================================================
   PLAYER NOTICE
========================================================= */

function showPlayerNotice(message) {

    const player =
        document.getElementById(
            "artplayer"
        );


    if (!player) {
        return;
    }


    player.innerHTML = `

        <div class="player-empty">

            <div class="empty-icon">
                <i class="fa-solid fa-circle-exclamation"></i>
            </div>

            <h3>
                Stream Unavailable
            </h3>

            <p>
                ${escapeHtml(message)}
            </p>

            <button
                type="button"
                onclick="showHome()"
                class="back-btn"
            >
                <i class="fa-solid fa-arrow-left"></i>
                BACK TO HOME
            </button>

        </div>

    `;

}


/* =========================================================
   HOME
========================================================= */

function showHome() {

    destroyPlayers();


    currentMatchId =
        null;


    currentMatchStreams =
        [];


    currentServerIndex =
        0;


    isSwitchingServer =
        false;


    const navActions =
        document.getElementById(
            "nav-actions-container"
        );


    if (navActions) {

        navActions.innerHTML = `

            <button
                class="search-btn"
                type="button"
                onclick="focusSearch()"
                aria-label="Search"
            >
                <i class="fa-solid fa-magnifying-glass"></i>
            </button>

            <button
                class="nav-telegram-btn"
                type="button"
                onclick="openTelegramModal()"
            >
                <i class="fa-brands fa-telegram"></i>
                <span>Telegram</span>
            </button>

        `;

    }


    document.getElementById(
        "player-section"
    ).style.display =
        "none";


    document.getElementById(
        "match-details-section"
    ).style.display =
        "none";


    document.getElementById(
        "home-section"
    ).style.display =
        "block";


    renderMatches();

}


/* =========================================================
   TELEGRAM MODAL
========================================================= */

function openTelegramModal() {

    const modal =
        document.getElementById(
            "telegram-modal"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "modal-open"
    );

}


function closeTelegramModal() {

    const modal =
        document.getElementById(
            "telegram-modal"
        );


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.classList.remove(
        "modal-open"
    );

}


function openTelegramModalAlt() {

    const modal =
        document.getElementById(
            "telegram-modal-alt"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "modal-open"
    );

}


function closeTelegramModalAlt() {

    const modal =
        document.getElementById(
            "telegram-modal-alt"
        );


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.classList.remove(
        "modal-open"
    );

}


/* =========================================================
   TELEGRAM BACKDROP + ESC
========================================================= */

function setupTelegramEvents() {

    const modal1 =
        document.getElementById(
            "telegram-modal"
        );


    const modal2 =
        document.getElementById(
            "telegram-modal-alt"
        );


    [modal1, modal2].forEach(
        modal => {

            if (!modal) {
                return;
            }


            modal.addEventListener(
                "click",
                event => {

                    if (
                        event.target ===
                        modal
                    ) {

                        if (
                            modal.id ===
                            "telegram-modal"
                        ) {

                            closeTelegramModal();

                        } else {

                            closeTelegramModalAlt();

                        }

                    }

                }
            );

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                closeTelegramModal();
                closeTelegramModalAlt();

            }

        }
    );

}


/* =========================================================
   COPY STREAM LINK
========================================================= */

async function copyStreamLink() {

    const url =
        window.location.href;


    try {

        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            await navigator.clipboard.writeText(
                url
            );

            showCopyMessage(
                "Stream URL Copied!"
            );

            return;

        }

    } catch (error) {

        console.warn(
            "Clipboard API failed:",
            error
        );

    }


    /*
     * Fallback for browsers where
     * Clipboard API is unavailable.
     */

    try {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            url;


        textarea.style.position =
            "fixed";

        textarea.style.opacity =
            "0";


        document.body.appendChild(
            textarea
        );


        textarea.select();


        document.execCommand(
            "copy"
        );


        textarea.remove();


        showCopyMessage(
            "Stream URL Copied!"
        );

    } catch (error) {

        alert(
            "Copy failed. Please copy the URL manually."
        );

    }

}


/* =========================================================
   COPY MESSAGE
========================================================= */

function showCopyMessage(message) {

    const old =
        document.querySelector(
            ".copy-toast"
        );


    if (old) {
        old.remove();
    }


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        "copy-toast";


    toast.innerHTML = `
        <i class="fa-solid fa-check"></i>
        ${escapeHtml(message)}
    `;


    document.body.appendChild(
        toast
    );


    setTimeout(
        () => {

            toast.classList.add(
                "hide"
            );


            setTimeout(
                () => toast.remove(),
                300
            );

        },
        1800
    );

}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {

    const searchBtn =
        document.querySelector(
            ".search-btn"
        );


    if (searchBtn) {

        searchBtn.onclick =
            focusSearch;

    }

}


function focusSearch() {

    let input =
        document.getElementById(
            "match-search-input"
        );


    if (!input) {

        createSearchBox();

        input =
            document.getElementById(
                "match-search-input"
            );

    }


    if (input) {

        input.focus();

        input.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    }

}


/* =========================================================
   SEARCH BOX
========================================================= */

function createSearchBox() {

    if (
        document.getElementById(
            "match-search-box"
        )
    ) {
        return;
    }


    const home =
        document.getElementById(
            "home-section"
        );


    if (!home) {
        return;
    }


    const box =
        document.createElement(
            "div"
        );


    box.id =
        "match-search-box";


    box.className =
        "match-search-box";


    box.innerHTML = `

        <div class="search-input-wrap">

            <i class="fa-solid fa-magnifying-glass"></i>

            <input
                id="match-search-input"
                type="search"
                placeholder="Search matches..."
                autocomplete="off"
            >

            <button
                type="button"
                onclick="closeSearch()"
                aria-label="Close search"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>

        </div>

    `;


    home.prepend(
        box
    );


    const input =
        document.getElementById(
            "match-search-input"
        );


    input.addEventListener(
        "input",
        () => {

            filterMatches(
                input.value
            );

        }
    );

}


function filterMatches(query) {

    const value =
        String(query || "")
            .trim()
            .toLowerCase();


    const cards =
        document.querySelectorAll(
            ".match-card, .schedule-card"
        );


    cards.forEach(
        card => {

            const text =
                card.innerText
                    .toLowerCase();


            card.style.display =
                !value ||
                text.includes(value)
                    ? ""
                    : "none";

        }
    );

}


function closeSearch() {

    const box =
        document.getElementById(
            "match-search-box"
        );


    if (box) {

        box.remove();

        renderMatches();

    }

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

    return String(value || "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}