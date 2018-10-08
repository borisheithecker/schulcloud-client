const _ = require('lodash');
const express = require('express');
const router = express.Router();
const marked = require('marked');
const api = require('../api');
const authHelper = require('../helpers/authentication');
const recurringEventsHelper = require('../helpers/recurringEvents');
const permissionHelper = require('../helpers/permissions');
const moment = require('moment');
const shortId = require('shortid');

const getSelectOptions = (req, service, query, values = []) => {
    return api(req).get('/' + service, {
        qs: query
    }).then(data => {
        return data.data;
    });
};


const markSelected = (options, values = []) => {
    return options.map(option => {
        option.selected = values.includes(option._id);
        return option;
    });
};

/**
 * creates an event for a created course. following params has to be included in @param course for creating the event:
 * startDate {Date} - the date the course is first take place
 * untilDate {Date} -  the date the course is last take place
 * duration {Number} - the duration of a course lesson
 * weekday {Number} - from 0 to 6, the weekday the course take place
 * @param course
 */
const createEventsForCourse = (req, res, course) => {
    // can just run if a calendar service is running on the environment
    if (process.env.CALENDAR_SERVICE_ENABLED) {
        return Promise.all(course.times.map(time => {
            return api(req).post("/calendar", {
                json: {
                    summary: course.name,
                    location: time.room,
                    description: course.description,
                    startDate: new Date(new Date(course.startDate).getTime() + time.startTime).toLocalISOString(),
                    duration: time.duration,
                    repeat_until: course.untilDate,
                    frequency: "WEEKLY",
                    weekday: recurringEventsHelper.getIsoWeekdayForNumber(time.weekday),
                    scopeId: course._id,
                    courseId: course._id,
                    courseTimeId: time._id
                }
            });
        }));
    }

    return Promise.resolve(true);
};

/**
 * Deletes all events from the given course, clear function
 * @param courseId {string} - the id of the course the events will be deleted
 */
const deleteEventsForCourse = (req, res, courseId) => {
    if (process.env.CALENDAR_SERVICE_ENABLED) {
        return api(req).get('courses/' + courseId).then(course => {
            return Promise.all((course.times || []).map(t => {
                if (t.eventId) {
                    return api(req).delete('calendar/' + t.eventId);
                }
            }));
        });
    }
    return Promise.resolve(true);
};

const editCourseHandler = (req, res, next) => {
    let coursePromise, action, method;
    if (req.params.courseId) {
        action = '/teams/' + req.params.courseId;
        method = 'patch';
        coursePromise = api(req).get('/courses/' + req.params.courseId, {
            qs: {
                $populate: ['ltiToolIds', 'classIds', 'teacherIds', 'userIds', 'substitutionIds']
            }
        });
    } else {
        action = '/teams/';
        method = 'post';
        coursePromise = Promise.resolve({});
    }

    const classesPromise = api(req).get('/classes', { qs: { $or: [{ "schoolId": res.locals.currentSchool }], $limit: 1000 }})
        .then(data => data.data );
    const teachersPromise = getSelectOptions(req, 'users', { roles: ['teacher', 'demoTeacher'], $limit: 1000 });
    const studentsPromise = getSelectOptions(req, 'users', { roles: ['student', 'demoStudent'], $limit: 1000 });

    Promise.all([
        coursePromise,
        classesPromise,
        teachersPromise,
        studentsPromise
    ]).then(([course, classes, teachers, students]) => {
        // these 3 might not change anything because hooks allow just ownSchool results by now, but to be sure:
        classes = classes.filter(c => c.schoolId == res.locals.currentSchool);
        teachers = teachers.filter(t => t.schoolId == res.locals.currentSchool);
        students = students.filter(s => s.schoolId == res.locals.currentSchool);
        let substitutions = _.cloneDeep(teachers);

        // map course times to fit into UI
        (course.times || []).forEach((time, count) => {
            time.duration = time.duration / 1000 / 60;
            const duration = moment.duration(time.startTime);
            time.startTime = ("00" + duration.hours()).slice(-2) + ':' + ("00" + duration.minutes()).slice(-2);
            time.count = count;
        });

        // format course start end until date
        if (course.startDate) {
            course.startDate = moment(new Date(course.startDate).getTime()).format("DD.MM.YYYY");
            course.untilDate = moment(new Date(course.untilDate).getTime()).format("DD.MM.YYYY");
        }

        // preselect current teacher when creating new course
        if (!req.params.courseId) {
            course.teacherIds = [];
            course.teacherIds.push(res.locals.currentUser);
        }

        res.render('teams/edit-team', {
            action,
            method,
            title: req.params.courseId ? 'Team bearbeiten' : 'Team anlegen',
            submitLabel: req.params.courseId ? 'Änderungen speichern' : 'Team anlegen',
            closeLabel: 'Abbrechen',
            course,
            classes: markSelected(classes, _.map(course.classIds, '_id')),
            teachers: markSelected(teachers, _.map(course.teacherIds, '_id')),
            substitutions: markSelected(substitutions, _.map(course.substitutionIds, '_id')),
            students: markSelected(students, _.map(course.userIds, '_id'))
        });
    });
};

const copyCourseHandler = (req, res, next) => {
    let coursePromise, action, method;
    if (req.params.courseId) {
        action = '/courses/copy/' + req.params.courseId;
        method = 'post';
        coursePromise = api(req).get('/courses/' + req.params.courseId, {
            qs: {
                $populate: ['ltiToolIds', 'classIds', 'teacherIds', 'userIds', 'substitutionIds']
            }
        });
    } else {
        action = '/courses/copy';
        method = 'post';
        coursePromise = Promise.resolve({});
    }

    const classesPromise = getSelectOptions(req, 'classes', { $limit: 1000 });
    const teachersPromise = getSelectOptions(req, 'users', { roles: ['teacher', 'demoTeacher'], $limit: 1000 });
    const studentsPromise = getSelectOptions(req, 'users', { roles: ['student', 'demoStudent'], $limit: 1000 });

    Promise.all([
        coursePromise,
        classesPromise,
        teachersPromise,
        studentsPromise
    ]).then(([course, classes, teachers, students]) => {

        classes = classes.filter(c => c.schoolId == res.locals.currentSchool);
        teachers = teachers.filter(t => t.schoolId == res.locals.currentSchool);
        students = students.filter(s => s.schoolId == res.locals.currentSchool);
        let substitutions = _.cloneDeep(teachers);

        // map course times to fit into UI
        (course.times || []).forEach((time, count) => {
            time.duration = time.duration / 1000 / 60;
            const duration = moment.duration(time.startTime);
            time.startTime = ("00" + duration.hours()).slice(-2) + ':' + ("00" + duration.minutes()).slice(-2);
            time.count = count;
        });

        // format course start end until date
        if (course.startDate) {
            course.startDate = moment(new Date(course.startDate).getTime()).format("DD.MM.YYYY");
            course.untilDate = moment(new Date(course.untilDate).getTime()).format("DD.MM.YYYY");
        }

        // preselect current teacher when creating new course
        if (!req.params.courseId) {
            course.teacherIds = [];
            course.teacherIds.push(res.locals.currentUser);
        }

        course.name = course.name + ' - Kopie';

        res.render('courses/edit-course', {
            action,
            method,
            title: 'Kurs klonen',
            submitLabel: 'Kurs klonen',
            closeLabel: 'Abbrechen',
            course,
            classes: classes,
            teachers: markSelected(teachers, _.map(course.teacherIds, '_id')),
            substitutions: substitutions,
            students: students
        });
    });
};

// secure routes
router.use(authHelper.authChecker);


/*
 * Courses
 */


router.get('/', function(req, res, next) {
    Promise.all([
        api(req).get('/courses/', {
            qs: {
                substitutionIds: res.locals.currentUser._id,
                $limit: 75
            }
        }),
        api(req).get('/courses/', {
            qs: {
                $or: [
                    {userIds: res.locals.currentUser._id},
                    {teacherIds: res.locals.currentUser._id}
                ],
                $limit: 75
            }
        })
    ]).then(([substitutionCourses, courses]) => {
        substitutionCourses = substitutionCourses.data.map(course => {
            course.url = '/teams/' + course._id;
            course.title = course.name;
            course.content = (course.description||"").substr(0, 140);
            course.secondaryTitle = '';
            course.background = course.color;
            course.memberAmount = course.userIds.length;
            (course.times || []).forEach(time => {
                time.startTime = moment(time.startTime, "x").format("HH:mm");
                time.weekday = recurringEventsHelper.getWeekdayForNumber(time.weekday);
                course.secondaryTitle += `<div>${time.weekday} ${time.startTime} ${(time.room)?('| '+time.room):''}</div>`;
            });
            return course;
        });

        courses = courses.data.map(course => {
            course.url = '/teams/' + course._id;
            course.title = course.name;
            course.content = (course.description||"").substr(0, 140);
            course.secondaryTitle = '';
            course.background = course.color;
            course.memberAmount = course.userIds.length;
            (course.times || []).forEach(time => {
                time.startTime = moment(time.startTime, "x").utc().format("HH:mm");
                time.weekday = recurringEventsHelper.getWeekdayForNumber(time.weekday);
                course.secondaryTitle += `<div>${time.weekday} ${time.startTime} ${(time.room)?('| '+time.room):''}</div>`;
            });

            return course;
        });
        if (req.query.json) {
            res.json(courses);
        } else {
            res.render('teams/overview', {
                title: 'Meine Teams',
                courses,
                substitutionCourses,
                searchLabel: 'Suche nach Teams',
                searchAction: '/courses',
                showSearch: true,
                liveSearch: true
            });
        }
    });
});

router.post('/', function(req, res, next) {
    // map course times to fit model
    (req.body.times || []).forEach(time => {
        time.startTime = moment.duration(time.startTime, "HH:mm").asMilliseconds();
        time.duration = time.duration * 60 * 1000;
    });

    req.body.startDate = moment(req.body.startDate, "DD:MM:YYYY")._d;
    req.body.untilDate = moment(req.body.untilDate, "DD:MM:YYYY")._d;

    if (!(moment(req.body.startDate, 'YYYY-MM-DD').isValid()))
        delete req.body.startDate;
    if (!(moment(req.body.untilDate, 'YYYY-MM-DD').isValid()))
        delete req.body.untilDate;

    api(req).post('/courses/', {
        json: req.body // TODO: sanitize
    }).then(course => {
        createEventsForCourse(req, res, course).then(_ => {
            res.redirect('/teams/' + course._id);
        });
    }).catch(err => {
        res.sendStatus(500);
    });
});

router.post('/copy/:courseId', function(req, res, next) {
    // map course times to fit model
    (req.body.times || []).forEach(time => {
        time.startTime = moment.duration(time.startTime, "HH:mm").asMilliseconds();
        time.duration = time.duration * 60 * 1000;
    });

    req.body.startDate = moment(req.body.startDate, "DD:MM:YYYY")._d;
    req.body.untilDate = moment(req.body.untilDate, "DD:MM:YYYY")._d;

    if (!(moment(req.body.startDate, 'YYYY-MM-DD').isValid()))
        delete req.body.startDate;
    if (!(moment(req.body.untilDate, 'YYYY-MM-DD').isValid()))
        delete req.body.untilDate;

    req.body._id = req.params.courseId;

    api(req).post('/courses/copy/', {
        json: req.body // TODO: sanitize
    }).then(course => {
        res.redirect('/teams/' + course._id);
    }).catch(err => {
        res.sendStatus(500);
    });
});

router.get('/add/', editCourseHandler);


/*
 * Single Course
 */

router.get('/:courseId/json', function(req, res, next) {
    Promise.all([
        api(req).get('/courses/' + req.params.courseId, {
            qs: {
                $populate: ['ltiToolIds']
            }
        }),
        api(req).get('/lessons/', {
            qs: {
                courseId: req.params.courseId
            }
        })
    ]).then(([course, lessons]) => res.json({ course, lessons }));
});

router.get('/:courseId/usersJson', function(req, res, next) {
    Promise.all([
        api(req).get('/courses/' + req.params.courseId, {
            qs: {
                $populate: ['userIds']
            }
        })
    ]).then(([course]) => res.json({ course }));
});

router.get('/:courseId', async function(req, res, next) {
    const course = await api(req).get('/courses/' + req.params.courseId, {
        qs: {
            $populate: ['ltiToolIds']
        }
    });

    res.render('teams/team', Object.assign({}, course, {
        title: course.name,
        breadcrumb: [{
                title: 'Meine Teams',
                url: '/teams'
            },
            {}
        ],
        filesUrl: `/files/courses/${req.params.courseId}`,
        nextEvent: recurringEventsHelper.getNextEventForCourseTimes(course.times)
    }));
});

router.get('/:courseId/members', async function(req, res, next) {
    const itemsPerPage = 25;
    const action = '/teams/' + req.params.courseId;
    const method = 'patch';

    const course = await api(req).get('/courses/' + req.params.courseId, {
        qs: {
            courseId: req.params.courseId,
            $populate: [
            {
                path: 'teacherIds',
                populate: ['schoolId']
            },
            {
                path: 'userIds',
                populate: ['schoolId']
            }]
        }
    });

    const courseUserIds = course.userIds.map(user => user._id);

    const users = (await api(req).get('/users', {
        qs: {
            _id: {
                $nin: courseUserIds
            }
        }
    })).data;

    const classes = await getSelectOptions(req, 'classes', {});

    let head = [
        'Vorname',
        'Nachname',
        'Rolle',
        'Schule',
        ''
    ];

    const body = course.userIds.map(user => {
        let row = [
            user.firstName || '',
            user.lastName || '',
            'Schüler',
            user.schoolId.name || '',
            {
                payload: {
                    userId: user._id
                }
            }
        ];

        row.push([{
            class: 'btn-delete-member',
            title: 'Nutzer entfernen',
            icon: 'remove'
        }]);

        return row;
    });

    let headInvitations = [
        'E-Mail',
        'Eingeladen am',
        'Rolle',
        ''
    ];

    const resendAction = [{
        class: 'btn-resend-invitation',
        title: 'Nutzer erneut einladen',
        icon: 'envelope'
    }];

    const bodyInvitations = [
        ['marco@polo.de', '24. September 2018', 'Experte', resendAction],
        ['axel@schweiss.de', '4. Oktober 2018', 'Experte', resendAction]
    ];

    res.render('teams/members', Object.assign({}, course, {
        title: 'Mitglieder',
        action,
        addMemberAction: `/teams/${req.params.courseId}/members`,
        inviteExternalMemberAction: `/teams/${req.params.courseId}/members/external`,
        deleteMemberAction: `/teams/${req.params.courseId}/members`,
        method,
        head,
        body,
        headInvitations,
        bodyInvitations,
        users,
        breadcrumb: [{
                title: 'Meine Teams',
                url: '/teams'
            },
            {
                title: course.name,
                url: '/teams/' + course._id
            },
            {}
        ]
    }));
});

router.get('/:courseId/topics', async function(req, res, next) {
    Promise.all([
        api(req).get('/courses/' + req.params.courseId, {
            qs: {
                $populate: ['ltiToolIds']
            }
        }),
        api(req).get('/lessons/', {
            qs: {
                courseId: req.params.courseId,
                $sort: 'position'
            }
        }),
        api(req).get('/homework/', {
            qs: {
                courseId: req.params.courseId,
                $populate: ['courseId'],
                archived: { $ne: res.locals.currentUser._id }
            }
        }),
        api(req).get('/courseGroups/', {
            qs: {
                courseId: req.params.courseId,
                $populate: ['courseId', 'userIds'],
            }
        })
    ]).then(([course, lessons, homeworks, courseGroups]) => {
        let ltiToolIds = (course.ltiToolIds || []).filter(ltiTool => ltiTool.isTemplate !== 'true');
        lessons = (lessons.data || []).map(lesson => {
            return Object.assign(lesson, {
                url: '/courses/' + req.params.courseId + '/topics/' + lesson._id + '/'
            });
        });

        homeworks = (homeworks.data || []).map(assignment => {
            assignment.url = '/homework/' + assignment._id;
            return assignment;
        });

        homeworks.sort((a, b) => {
            if (a.dueDate > b.dueDate) {
                return 1;
            } else {
                return -1;
            }
        });

        courseGroups = permissionHelper.userHasPermission(res.locals.currentUser, 'COURSE_EDIT') ?
            courseGroups.data || [] :
            (courseGroups.data || []).filter(cg => cg.userIds.some(user => user._id === res.locals.currentUser._id));

        res.render('teams/topics', Object.assign({}, course, {
            title: course.name,
            lessons,
            homeworks: homeworks.filter(function(task) { return !task.private; }),
            myhomeworks: homeworks.filter(function(task) { return task.private; }),
            ltiToolIds,
            courseGroups,
            breadcrumb: [{
                    title: 'Meine Teams',
                    url: '/teams'
                },
                {
                    title: course.name,
                    url: '/teams/' + course._id
                },
                {}
            ],
            filesUrl: `/files/courses/${req.params.courseId}`,
            nextEvent: recurringEventsHelper.getNextEventForCourseTimes(course.times)
        }));
    }).catch(err => {
        next(err);
    });
});

router.patch('/:courseId', async function(req, res, next) {
    // map course times to fit model
    req.body.times = req.body.times || [];
    req.body.times.forEach(time => {
        time.startTime = moment.duration(time.startTime).asMilliseconds();
        time.duration = time.duration * 60 * 1000;
    });

    req.body.startDate = moment(req.body.startDate, "DD:MM:YYYY")._d;
    req.body.untilDate = moment(req.body.untilDate, "DD:MM:YYYY")._d;

    if (!req.body.classIds)
        req.body.classIds = [];
    if (!req.body.userIds)
        req.body.userIds = [];
    if (!req.body.substitutionIds)
        req.body.substitutionIds = [];

    if (!(moment(req.body.startDate, 'YYYY-MM-DD').isValid()))
        delete req.body.startDate;
    if (!(moment(req.body.untilDate, 'YYYY-MM-DD').isValid()))
        delete req.body.untilDate;

    // first delete all old events for the course
    // deleteEventsForCourse(req, res, req.params.courseId).then(async _ => {

    await api(req).patch('/courses/' + req.params.courseId, {
        json: req.body // TODO: sanitize
    });

    // await createEventsForCourse(req, res, courseUpdated);

    res.redirect('/teams/' + req.params.courseId);

    // }).catch(error => {
    //     res.sendStatus(500);
    // });
});

router.patch('/:courseId/members', async function(req, res, next) {
    const courseOld = await api(req).get('/courses/' + req.params.courseId);
    let userIds = courseOld.userIds.concat(req.body.newUserIds);

    await api(req).patch('/courses/' + req.params.courseId, {
        json: {
            userIds
        }
    });

    res.sendStatus(200);
});

router.post('/:courseId/members/external', async function(req, res, next) {
    await api(req).patch('/courses/' + req.params.courseId, {
        json: {
            email: req.body.email,
            role: req.body.role
        }
    });

    res.sendStatus(200);
});

router.delete('/:courseId/members', async function(req, res, next) {
    const courseOld = await api(req).get('/courses/' + req.params.courseId);
    let userIds = courseOld.userIds.filter(id => id !== req.body.userIdToRemove);

    await api(req).patch('/courses/' + req.params.courseId, {
        json: {
            userIds
        }
    });

    res.sendStatus(200);
});

router.patch('/:courseId/positions', function(req, res, next) {
    for (var elem in req.body) {
        api(req).patch('/lessons/' + elem, {
            json: {
                position: parseInt(req.body[elem]),
                courseId: req.params.courseId
            }
        });
    }

    res.sendStatus(200);
});


router.delete('/:courseId', function(req, res, next) {
    deleteEventsForCourse(req, res, req.params.courseId).then(_ => {
        api(req).delete('/courses/' + req.params.courseId).then(_ => {
            res.sendStatus(200);
        });
    }).catch(_ => {
        res.sendStatus(500);
    });
});

router.get('/:courseId/addStudent', function(req, res, next) {
    let currentUser = res.locals.currentUser;
    // if currentUser isn't a student don't add to course-students
    if (currentUser.roles.filter(r => r.name === 'student').length <= 0) {
        req.session.notification = {
            type: 'danger',
            message: "Sie sind kein Nutzer der Rolle 'Schüler'."
        };
        res.redirect('/teams/' + req.params.courseId);
        return;
    }

    // check if student is already in course
    api(req).get('/courses/' + req.params.courseId).then(course => {
        if (_.includes(course.userIds, currentUser._id)) {
            req.session.notification = {
                type: 'danger',
                message: `Sie sind bereits Teilnehmer des Kurses/Fachs ${course.name}.`
            };
            res.redirect('/teams/' + req.params.courseId);
            return;
        }

        // add Student to course
        course.userIds.push(currentUser._id);
        api(req).patch("/courses/" + course._id, {
            json: course
        }).then(_ => {
            req.session.notification = {
                type: 'success',
                message: `Sie wurden erfolgreich beim Kurs/Fach ${course.name} hinzugefügt`
            };
            res.redirect('/teams/' + req.params.courseId);
        });
    }).catch(err => {
        next(err);
    });
});

router.post('/:courseId/importTopic', function(req, res, next) {
    let shareToken = req.body.shareToken;
    // try to find topic for given shareToken
    api(req).get("/lessons/", { qs: { shareToken: shareToken, $populate: ['courseId'] } }).then(lessons => {
        if ((lessons.data || []).length <= 0) {
            req.session.notification = {
                type: 'danger',
                message: 'Es wurde kein Thema für diesen Code gefunden.'
            };

            res.redirect(req.header('Referer'));
        }

        api(req).post("/lessons/copy", { json: {lessonId: lessons.data[0]._id, newCourseId: req.params.courseId, shareToken}})
            .then(_ => {
                res.redirect(req.header('Referer'));
            });

    }).catch(err => res.status((err.statusCode || 500)).send(err));
});


router.get('/:courseId/edit', editCourseHandler);

router.get('/:courseId/copy', copyCourseHandler);

// return shareToken
router.get('/:id/share', function(req, res, next) {
    return api(req).get('/courses/share/' + req.params.id)
        .then(course => {
            return res.json(course);
    });
});

// return course Name for given shareToken
router.get('/share/:id', function (req, res, next) {
   return api(req).get('/courses/share', { qs: { shareToken: req.params.id }})
        .then(name => {
            return res.json({ msg: name, status: 'success' });
        })
       .catch(err => {
            return res.json({ msg: 'ShareToken is not in use.', status: 'error' });
       });
});

router.post('/import', function(req, res, next) {
    let shareToken = req.body.shareToken;
    let courseName = req.body.name;

    api(req).post('/courses/share', { json: { shareToken, courseName }})
        .then(course => {
            res.redirect(`/teams/${course._id}/edit/`);
        })
        .catch(err => {
            res.status((err.statusCode || 500)).send(err);
        });
});

/**
 * Generates short team invite link. can be used as function or as hook call.
 * @param params = object {
 *      role: user role = string "teamexpert"/"teamadministrator"
 *      save: hash will be generated with URI-safe characters = boolean (might be a string)
 *      patchUser: hash will be patched into the user (DB) = boolean (might be a string)
 *      host: current webaddress from client = string
 *      teamId: users teamId = string
 *      toHash: invited users mail for hash generation = string
 *  }
 * @param internalReturn: just return results to callee if true, for use as a hook false = boolean
 */
const generateInviteLink = (params, internalReturn) => {
    return function (req, res, next) {
        let options = JSON.parse(JSON.stringify(params));
        if (!options.role) options.role = req.body.role || "";
        if (!options.save) options.save = req.body.save || "";
        if (!options.patchUserInvite) options.patchUserInvite = req.body.patchUserInvite || "";
        if (!options.host) options.host = req.headers.host || "";
        if (!options.teamId) options.teamId = req.body.teamId || "";
        if (!options.toHash) options.toHash = req.body.email || req.body.toHash || "";
        
        if(internalReturn){
            return api(req).post("/teaminvitelink/", {
                json: options
            });
        } else {
            return api(req).post("/teaminvitelink/", {
                json: options
            }).then(linkData => {
                res.locals.linkData = linkData;
                res.locals.options = options;
                if(options.patchUserInvite) req.body.inviteHash = linkData.hash;
                next();
            }).catch(err => {
                req.session.notification = {
                    'type': 'danger',
                    'message': `Fehler beim Erstellen des Registrierungslinks. Bitte selbstständig Registrierungslink im Nutzerprofil generieren und weitergeben. ${(err.error||{}).message || err.message || err || ""}`
                };
                res.redirect(req.header('Referer'));
            });
        }
    };
};

const sendMailHandler = (internalReturn) => {
    return function (req, res, next) {
        let data = Object.assign(res.locals.options, res.locals.linkData);
        if(data.toHash && data.teamId && data.shortLink) {
            return api(req).post('/mails/', {
                json: {
                    email: data.toHash,
                    subject: `Einladung für die Nutzung der ${res.locals.theme.title}!`,
                    headers: {},
                    content: {
                        "text": `Einladung in die ${res.locals.theme.title}
Hallo ${data.email}!
\nDu wurdest eingeladen, der ${res.locals.theme.title} beizutreten, bitte vervollständige deine Registrierung unter folgendem Link: ${data.shortLink}
\nViel Spaß und einen guten Start wünscht dir dein
${res.locals.theme.short_title}-Team`
                    }
                }
            }).then(_ => {
                if(internalReturn) return true;
                req.session.notification = {
                    type: 'success',
                    message: 'Nutzer erfolgreich eingeladen und Informationen per E-Mail verschickt.'
                };
                res.redirect(req.header('Referer'));
            }).catch(err => {
                if(internalReturn) return false;
                req.session.notification = {
                    'type': 'danger',
                    'message': `Nutzer erfolgreich eingeladen. Fehler beim Versenden der E-Mail. Bitte Einladungsmail erneut zusenden. ${(err.error || {}).message || err.message || err || ""}`
                };
                res.redirect(req.header('Referer'));
            });
        } else {
            if(internalReturn) return true;
            req.session.notification = {
                type: 'danger',
                message: 'Nutzer erfolgreich eingeladen. Fehler beim Versenden der E-Mail. Bitte Einladungsmail erneut zusenden.'
            };
            res.redirect(req.header('Referer'));
        }
    }
};

// client-side use
// WITH PERMISSION - NEEDED FOR LIVE
// router.post('/invitelink/', permissionHelper.permissionsChecker(['ADD_SCHOOL_MEMBERS']), generateInviteLink({}), (req, res) => { res.json(res.locals.linkData);});
router.post('/invitelink/', generateInviteLink({}), sendMailHandler(), (req, res) => { res.json(res.locals.linkData) });


module.exports = router;