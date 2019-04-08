/* global kjua jQuery introJs */
import { setupFirebasePush } from './notificationService/indexFirebase';
import { sendShownCallback, sendReadCallback } from './notificationService/callback';
import { iFrameListen } from './helpers/iFrameResize';
import messageClient from './message/message-client';
import toast from './toasts';
import './jquery/infinite-scroll.pkgd.min.js';


iFrameListen();

let $contactHPIModal;
let $contactAdminModal;

if (window.opener && window.opener !== window) {
    window.isInline = true;
}

function toggleMobileNav() {
    document.querySelector('aside.nav-sidebar').classList.toggle('active');
    this.classList.toggle('active');
}

function toggleMobileSearch() {
    document.querySelector('.search-wrapper .input-group').classList.toggle('active');
    document.querySelector('.search-wrapper .mobile-search-toggle .fa').classList.toggle('fa-search');
    document.querySelector('.search-wrapper .mobile-search-toggle .fa').classList.toggle('fa-times');
}

function togglePresentationMode() {
    const contentArea = $('#main-content');
    const toggleButton = $('.btn-fullscreen');
    $('body').toggleClass('fullscreen');
    toggleButton.children('i').toggleClass('fa-compress');
    toggleButton.children('i').toggleClass('fa-expand');
}

let fullscreen = false;

function fullscreenBtnClicked() {
    togglePresentationMode();
    fullscreen = !fullscreen;
    sessionStorage.setItem('fullscreen', JSON.stringify(fullscreen));
}

function sendFeedback(modal, e) {
    let fmodal = $(modal);
    e.preventDefault();

    let type = (fmodal[0].className.includes('contactHPI-modal')) ? 'contactHPI' : 'contactAdmin';
    let subject = (type === 'contactHPI') ? 'Feedback' : 'Problem ' + fmodal.find('#title').val();

    $.ajax({
        url: '/helpdesk',
        type: 'POST',
        data: {
            type: type,
            subject: subject,
            category: fmodal.find('#category').val(),
            role: fmodal.find('#role').val(),
            desire: fmodal.find('#desire').val(),
            benefit: fmodal.find("#benefit").val(),
            acceptanceCriteria: fmodal.find("#acceptance_criteria").val(),
            currentState: fmodal.find('#hasHappened').val(),
            targetState: fmodal.find('#supposedToHappen').val()
        },
        success: function (result) {
            showAJAXSuccess("Feedback erfolgreich versendet!", fmodal);
        },
        error: function (result) {
            showAJAXError({}, "Fehler beim senden des Feedbacks", result);
        }
    });
    $('.contactHPI-modal').find('.btn-submit').prop("disabled", true);
};

function showAJAXSuccess(message, modal) {
    modal.modal('hide');
    $.showNotification(message, 'success', true);
}

$(document).ready(function () {
    // Init mobile nav
    var mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    var mobileSearchToggle = document.querySelector('.mobile-search-toggle');
    if (mobileNavToggle) {
        mobileNavToggle.addEventListener('click', toggleMobileNav);
    }
    if (mobileSearchToggle) {
        mobileSearchToggle.addEventListener('click', toggleMobileSearch);
    }

    // Init modals
    var $modals = $('.modal');
    $contactHPIModal = document.querySelector('.contactHPI-modal');
    var $featureModal = $('.feature-modal');
    $contactAdminModal = document.querySelector('.contactAdmin-modal');

    $('.submit-contactHPI').on('click', function (e) {
        e.preventDefault();

        $('.contactHPI-modal').find('.btn-submit').prop("disabled", false);
        populateModalForm($($contactHPIModal), {
            title: 'Wunsch oder Problem senden',
            closeLabel: 'Abbrechen',
            submitLabel: 'Senden',
            fields: {
                feedbackType: "userstory"
            }
        });

        $($contactHPIModal).appendTo('body').modal('show');
    });
    $contactHPIModal.querySelector('.modal-form').addEventListener("submit", sendFeedback.bind(this, $contactHPIModal));

    $('.submit-contactAdmin').on('click', function (e) {
        e.preventDefault();

        $('.contactAdmin-modal').find('.btn-submit').prop("disabled", false);
        populateModalForm($($contactAdminModal), {
            title: 'Admin deiner Schule kontaktieren',
            closeLabel: 'Abbrechen',
            submitLabel: 'Senden'
        });
        $($contactAdminModal).appendTo('body').modal('show');
    });

    $contactAdminModal.querySelector('.modal-form').addEventListener("submit", sendFeedback.bind(this, $contactAdminModal));

    $contactAdminModal.querySelector('.modal-form').addEventListener("submit", sendFeedback.bind(this, $contactAdminModal));

    $modals.find('.close, .btn-close').on('click', function () {
        $modals.modal('hide');
    });

    $('.notification-dropdown-toggle').on('click', function () {
        $(this).removeClass('recent');
    });

    $('.btn-create-qr').on('click', function () {
        // create qr code for current page
        let image = kjua({ text: window.location.href, render: 'image' });
        let $qrbox = $('.qr-show');
        $qrbox.empty();
        $qrbox.append(image);
    });

    // Init mobile nav
    if (document.getElementById('searchBar') instanceof Object) {
        document.querySelector('.mobile-nav-toggle').addEventListener('click', toggleMobileNav);
        document.querySelector('.mobile-search-toggle').addEventListener('click', toggleMobileSearch);
    }

    if (!fullscreen) {
        fullscreen = JSON.parse(sessionStorage.getItem("fullscreen")) || false;
        if (fullscreen) {
            togglePresentationMode();
        }
    }
    if (document.querySelector('.btn-fullscreen')) {
        document.querySelector('.btn-fullscreen').addEventListener('click', fullscreenBtnClicked);
    }

    $('.btn-cancel').on('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        let $cancelModal = $('.cancel-modal');
        populateModalForm($cancelModal, {
            title: 'Bist du dir sicher, dass du die Änderungen verwerfen möchtest?',
        });
        $cancelModal.appendTo('body').modal('show');
    });

    populateModalForm($featureModal, {
        title: 'Neue Features sind verfügbar',
        closeLabel: 'Abbrechen'
    });

    // from: https://stackoverflow.com/a/187557
    jQuery.expr[":"].Contains = jQuery.expr.createPseudo(function (arg) {
        return function (elem) {
            return jQuery(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
        };
    });
    // js course search/filter
    $("input.js-search").on("keyup", e => {
        if (e.key === "Escape") $(e.target).val("");
        if (e.key === "Unidentified") {
            return false;
        }
        $(".sc-card-title").find('.title:not(:Contains("' + $(e.target).val() + '"))').parents(".sc-card-wrapper").fadeOut(400);
        $(".sc-card-title").find('.title:Contains("' + $(e.target).val() + '")').parents(".sc-card-wrapper").fadeIn(400);

        return !(e.key === "Unidentified");
    });
});

function showAJAXError(req, textStatus, errorThrown) {
    $($contactHPIModal).modal('hide');
    $($contactAdminModal).modal('hide');
    if (textStatus === 'timeout') {
        $.showNotification('Zeitüberschreitung der Anfrage', 'warn', true);
    } else {
        $.showNotification(errorThrown, 'danger', true);
    }
}

window.addEventListener('DOMContentLoaded', function () {

    let feedbackSelector = document.querySelector('#feedbackType');
    if (feedbackSelector) {
        feedbackSelector.onchange = function () {
            if (feedbackSelector.value === "problem") {
                document.getElementById("problemDiv").style.display = "block";
                document.getElementById("userstoryDiv").style.display = "none";
                document.querySelectorAll("#problemDiv input, #problemDiv textarea, #problemDiv select").forEach((node) => {
                    node.required = true;
                });
                document.querySelectorAll("#userstoryDiv input, #userstoryDiv textarea, #userstoryDiv select").forEach((node) => {
                    node.required = false;
                });
            } else {
                document.getElementById("problemDiv").style.display = "none";
                document.getElementById("userstoryDiv").style.display = "block";
                document.querySelectorAll("#problemDiv input, #problemDiv textarea, #problemDiv select").forEach((node) => {
                    node.required = false;
                });
                document.querySelectorAll("#userstoryDiv input, #userstoryDiv textarea, #userstoryDiv select").forEach((node) => {
                    node.required = true;
                });
                document.getElementById("acceptance_criteria").required = false;
            }
        };
    }
});

// loading animation
document.addEventListener('DOMContentLoaded', (e) => {
    document.querySelector('body').classList.add('loaded');
});
window.addEventListener('beforeunload', (e) => {
    document.querySelector('body').classList.remove('loaded');
});
window.addEventListener('pageshow', (e) => {
    document.querySelector('body').classList.add('loaded');
});

function changeNavBarPositionToAbsolute() {
    const navBar = document.querySelector('.nav-sidebar');
    navBar.classList.add('position-absolute');
}

function changeNavBarPositionToFixed() {
    const navBar = document.querySelector('.nav-sidebar');
    navBar.classList.remove('position-absolute');
}

function startIntro() {
    changeNavBarPositionToAbsolute();
    introJs()
        .setOptions({
            nextLabel: 'Weiter',
            prevLabel: 'Zurück',
            doneLabel: 'Fertig',
            skipLabel: 'Überspringen',
        })
        .start()
        .oncomplete(changeNavBarPositionToFixed);
}

window.addEventListener('load', () => {
    const continueTuorial = localStorage.getItem('Tutorial');
    if (continueTuorial == 'true') {
        startIntro();
        localStorage.setItem('Tutorial', false);
    }
    if ('serviceWorker' in navigator) {
        // enable sw for half of users only
        const testUserGroup = parseInt(document.getElementById('testUserGroup').value);
        // if (testUserGroup === 1) {
        // 	navigator.serviceWorker.register('/sw.js').then((registration) => {
        // 		//...
        // 	});
        // }
        // enable messaging service worker
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
            if (!/^((?!chrome).)*safari/i.test(navigator.userAgent)) {
                setupFirebasePush(registration);
            }
            messageClient.setupMessagingClient(registration);
        });
    }
});

document.getElementById('intro-loggedin').addEventListener('click', startIntro, false);

function downloadCourse(event) {
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            tag: 'course-data-updated',
            courseId: $(this).attr('data-id'),
            _id: Date.now(),
        });
    } else {
        console.log('SW not active!');
    }
}

Array.from(document.getElementsByClassName('downloadOffline')).forEach((element) => {
    element.addEventListener('click', downloadCourse, false);
});

window.addEventListener("load", () => {
    var continueTuorial = localStorage.getItem('Tutorial');
    if (continueTuorial == 'true') {
        startIntro();
        localStorage.setItem('Tutorial', false);
    }
    if ('serviceWorker' in navigator) {
        // enable sw for half of users only
        let testUserGroup = parseInt(document.getElementById('testUserGroup').value);
        if (testUserGroup == 1) {
            navigator.serviceWorker.register('/sw.js');
        }
    }
    document.getElementById("intro-loggedin").addEventListener("click", startIntro, false);
});

document.querySelectorAll('#main-content a').forEach((a) => {
    const href = a.getAttribute('href');
    if (a.querySelector('img, .fa') == null && href) {
        if (!(href.startsWith('https://schul-cloud.org') || href.startsWith('#') || href.startsWith('/') || href === '')) {
            if (!a.getAttribute('target')) {
                a.setAttribute('target', '_blank');
            }
            a.classList.add('externalLink');
        }
    }
});

function showHideControls() {
    const loadedItems = $('#recent-notification-list .notification-item').length;
    if (loadedItems) {
        $('#recent-notification-container .controls').show();
    } else {
        $('#recent-notification-container .controls').hide();
    }
}

window.reloadNotificationList = function (add, showBadge) {
    let loadedItems = $('#recent-notification-list .notification-item').length;
    if (add) {
        loadedItems += add;
    }
    $('#recent-notification-list').load(`/notification/messages?limit=${loadedItems}`, () => {
        showHideControls();
        if (showBadge) {
            let unread = $('#recent-notification-list .meta').attr('data-unread');
            if (unread) {
                const metaUnread = $('.notification-dropdown .meta-unread');
                metaUnread.text(unread);
                metaUnread.show();
                $('.notification-dropdown-toggle').click(function (event) {
                    metaUnread.hide();
                });
            }
        }
    });
}

window.notificationSeen = function (url, id, callback) {
    function updateUi(id) {
        reloadNotificationList();
    }
    $.get(url, function (response) {
        if (response.status === 'success') {
            updateUi(id);
        } else {
            toast('errorMarkNotificationAsSeen');
        }
        if (callback) { callback(); }
    });
};

window.notificationDelete = function (id) {
    $.ajax({
        url: '/notification/' + id,
        type: 'DELETE',
        success: function (result) {
            reloadNotificationList();
        },
    });
}

window.showNotificationDetails = function (id, url) {
    let $notificationModal = $('.notification-modal');
    function openModal() {
        populateModalForm($notificationModal, {
            title: 'Benachrichtigung lesen',
            closeLabel: 'Schließen',
            submitLabel: 'Löschen',
            fields: { id }
        });
        $notificationModal.find('.btn-delete').click(e => {
            $notificationModal.modal('hide');
            notificationDelete(id);
        });
        $notificationModal.find('.modal-body').load('/notification/message/' + id);
        $notificationModal.appendTo('body').modal('show');
    }
    if (url) {
        notificationSeen(url, id, openModal);
    } else { openModal(); }
}

window.addEventListener('load', (event) => {
    $('#recent-notification-list').infiniteScroll({
        "path": function () {
            var loadedItems = $('#recent-notification-list .notification-item').length;
            return '/notification/messages/?limit=10&skip=' + loadedItems;
        },
        "append": ".notification-item",
        "history": false,
        status: ".page-load-status",
        scrollThreshold: 400,
        elementScroll: '#recent-notification-container',
        checkLastPage: '.notification-item',
    });
    $('.page-load-status').hide();
    showHideControls();
});

window.seenAllNotifications = function () {
    $.ajax({
        url: '/notification/messages/readAll',
        method: 'POST',
        success: function () { reloadNotificationList(); }
    });
}

window.deleteAllNotifications = function () {
    $.ajax({
        url: '/notification/messages/removeAll',
        type: 'POST',
        success: function () { reloadNotificationList(); }
    });
}
