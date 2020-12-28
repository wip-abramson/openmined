import { Course, ProjectAttemptStatus } from '@openmined/shared/types';
import { analytics } from 'firebase';
import {
  hasCompletedConcept,
  hasCompletedLesson,
  hasStartedConcept,
  hasStartedCourse,
  hasStartedLesson,
  hasStartedProject,
  PROJECT_PART_SUBMISSIONS,
} from './_helpers';

export const getUserRef = (db: firebase.firestore.Firestore, uId: string) =>
  db.collection('users').doc(uId);

export const getCourseRef = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string
) => db.collection('users').doc(uId).collection('courses').doc(courseId);

export const updateCourse = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string,
  data: any
) => getCourseRef(db, uId, courseId).set(data, { merge: true });

export const handleConceptStarted = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  ts,
  progress: Course,
  lesson: string,
  concept: string
) => {
  if (!hasStartedConcept(progress, lesson, concept)) {
    analytics.logEvent('concept_started', {
      course: courseId,
      lesson,
      concept,
    });

    const data = progress;

    // Then the concept data structure inside that
    data.lessons[lesson].concepts[concept] = {
      started_at: ts(),
    };

    // When the object is constructed, store it!
    return updateCourse(db, uId, courseId, data);
  }
};

export const handleConceptComplete = (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  ts,
  progress: Course,
  lesson: string,
  concept: string
) =>
  new Promise((resolve, reject) => {
    // If we haven't already completed this concept...
    if (!hasCompletedConcept(progress, lesson, concept)) {
      analytics.logEvent('concept_completed', {
        course: courseId,
        lesson,
        concept,
      });

      // Tell the DB we've done so
      updateCourse(db, uId, courseId, {
        lessons: {
          [lesson]: {
            concepts: {
              [concept]: {
                completed_at: ts(),
              },
            },
          },
        },
      })
        .then(resolve)
        .catch(reject);
    } else {
      resolve(true);
    }
  });

export const handleQuizFinish = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  arrayUnion,
  progress: Course,
  lesson: string,
  concept: string,
  numQuizzes,
  correctAnswers,
  quiz
) => {
  const numQuizzesInDb = progress.lessons[lesson].concepts[concept].quizzes
    ? progress.lessons[lesson].concepts[concept].quizzes.length
    : 0;

  if (numQuizzesInDb < numQuizzes) {
    const percentage = (correctAnswers / quiz.length) * 100;

    analytics.logEvent('quiz_completed', {
      course: courseId,
      lesson,
      concept,
      percentage,
      questions: quiz.length,
      correct: correctAnswers,
    });

    return updateCourse(db, uId, courseId, {
      lessons: {
        [lesson]: {
          concepts: {
            [concept]: {
              quizzes: arrayUnion({
                correct: correctAnswers,
                total: quiz.length,
                percentage,
              }),
            },
          },
        },
      },
    });
  }
};

export const handleLessonStart = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  ts,
  progress: Course,
  lesson: string
) => {
  const isCourseStarted = hasStartedCourse(progress);
  const isLessonStarted = hasStartedLesson(progress, lesson);

  const data = progress;

  // Append the course data structure
  if (!isCourseStarted) {
    analytics.logEvent('course_started', { course: courseId });

    data.started_at = ts();
    data.lessons = {};
  }

  // Then the lesson data structure inside that
  if (!isLessonStarted) {
    analytics.logEvent('lesson_started', { course: courseId, lesson });

    data.lessons[lesson] = {
      started_at: ts(),
      concepts: {},
    };
  }

  // When the object is constructed, store it!
  return updateCourse(db, uId, courseId, data);
};

export const handleLessonComplete = (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  ts,
  progress: Course,
  lesson: string
) =>
  new Promise((resolve, reject) => {
    // If we haven't already completed this lesson...
    if (!hasCompletedLesson(progress, lesson)) {
      analytics.logEvent('lesson_completed', { course: courseId, lesson });

      // Tell the DB we've done so
      updateCourse(db, uId, courseId, {
        lessons: {
          [lesson]: {
            completed_at: ts(),
          },
        },
      })
        .then(resolve)
        .catch(reject);
    } else {
      resolve(true);
    }
  });

export const handleProjectPartBegin = (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  ts,
  progress: Course,
  part: string
) => {
  const data = progress;

  // If they haven't begun the project at all
  if (!hasStartedProject(progress)) {
    analytics.logEvent('project_started', { course: courseId });

    data.project = {
      started_at: ts(),
      parts: {},
    };
  }

  analytics.logEvent('project_part_started', { course: courseId, part });

  // Add the project part to the object of parts
  data.project.parts[part] = {
    started_at: ts(),
    submissions: [], // Make sure to set the submissions array up
  };

  return updateCourse(db, uId, courseId, data);
};

export const getSubmissionsRef = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string
) =>
  db
    .collection('users')
    .doc(uId)
    .collection('courses')
    .doc(courseId)
    .collection('submissions');

export const addSubmission = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string,
  data: any
) => {
  const submission = getSubmissionsRef(db, uId, courseId).doc().id;
  const submissionRef = getSubmissionsRef(db, uId, courseId).doc(submission);

  submissionRef.set({ ...data, id: submission });

  return submissionRef;
};

export const handleAttemptSubmission = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  arrayUnion,
  currentTime,
  progress: Course,
  part: string,
  content: string
) => {
  // Get their current submissions
  const submissions = progress.project.parts[part].submissions;

  // If we have less than the total number of allowed submissions
  if (submissions.length < PROJECT_PART_SUBMISSIONS) {
    const attemptNum =
      submissions && submissions.length ? submissions.length + 1 : 1;

    analytics.logEvent('project_submission_created', {
      course: courseId,
      part,
      attempt: attemptNum,
    });

    // Get the current time
    const time = currentTime();

    // First, submit the submissions to the submissions subcollection
    const submission = await addSubmission(db, uId, courseId, {
      course: courseId,
      part,
      attempt: attemptNum,
      student: db.collection('users').doc(uId),
      submitted_at: time,
      submission_content: content,
      mentor: null,
      status: null,
      review_content: null,
      review_started_at: null,
      review_ended_at: null,
    });

    // Once that's done, add the submissions to the submissions array on the user's course document
    // Note the use of the reference to the previous submission
    await updateCourse(db, uId, courseId, {
      project: {
        parts: {
          [part]: {
            submissions: arrayUnion({
              submitted_at: time,
              submission,
            }),
          },
        },
      },
    });

    return true;
  } else {
    return false;
  }
};

export const handleReviewSubmission = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  currentTime,
  studentId: string,
  mentorId: string,
  courseId: string,
  partId: string,
  attemptId: string,
  submissionId: string,
  status: ProjectAttemptStatus,
  progress: Course,
  content: string
) => {
  analytics.logEvent('project_submission_reviewed', {
    course: courseId,
    part: partId,
    attempt: attemptId,
  });

  // Get the current time
  const time = currentTime();

  // First, update the submission in the submissions subcollection
  await getSubmissionsRef(db, studentId, courseId).doc(submissionId).set(
    {
      status,
      review_content: content,
      review_ended_at: time,
    },
    { merge: true }
  );

  // Get the current submissions
  const submissions = progress.project.parts[partId].submissions;

  // Change the status and reviewed_at time of this specific attempt
  submissions[+attemptId - 1].status = status;
  submissions[+attemptId - 1].reviewed_at = time;

  // Once that's done, update the submissions array
  await updateCourse(db, studentId, courseId, {
    project: {
      parts: {
        [partId]: {
          completed_at: time,
          submissions,
        },
      },
    },
  });

  // And lastly, update the mentor's record of the events
  await db
    .collection('users')
    .doc(mentorId)
    .collection('reviews')
    .doc(submissionId)
    .set(
      {
        status: 'reviewed',
        completed_at: time,
      },
      { merge: true }
    );

  return true;
};

export const getFeedbackRef = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string,
  feedbackId: string
) =>
  db
    .collection('users')
    .doc(uId)
    .collection('courses')
    .doc(courseId)
    .collection('feedback')
    .doc(feedbackId);

export const updateFeedback = (
  db: firebase.firestore.Firestore,
  uId: string,
  courseId: string,
  feedbackId: string,
  data: any
) => getFeedbackRef(db, uId, courseId, feedbackId).set(data, { merge: true });

export const handleProvideFeedback = async (
  db: firebase.firestore.Firestore,
  analytics: firebase.analytics.Analytics,
  uId: string,
  courseId: string,
  feedbackId: string,
  value: number,
  feedback: string | null,
  type: 'concept' | 'lesson' | 'project'
) => {
  analytics.logEvent('feedback_created', {
    course: courseId,
    feedback: feedbackId,
    type,
  });

  return updateFeedback(db, uId, courseId, feedbackId, {
    value,
    feedback,
    type,
  });
};
