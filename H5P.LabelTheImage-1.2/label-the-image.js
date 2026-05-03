var H5P = H5P || {};

H5P.LabelTheImage = (function ($, Question) {
  'use strict';

  var DEFAULTS = {
    taskDescription: '',
    points: [],
    behaviour: {
      enableRetry: true,
      enableSolutionsButton: true,
      enableCheckButton: true,
      acceptSpellingErrors: false,
      caseSensitive: false,
      inputMode: 'inline'
    },
    overallFeedback: [],
    l10n: {
      checkAnswer: 'Check',
      showSolution: 'Show solution',
      tryAgain: 'Retry',
      submitAnswer: 'Submit',
      closeLabel: 'Close',
      hintLabel: 'Hint',
      correct: 'Correct',
      incorrect: 'Incorrect',
      almost: 'Almost — check your spelling',
      scoreBarLabel: 'You got :num out of :total points',
      answerPlaceholder: 'Type your answer'
    },
    a11y: {
      markerLabel: 'Label point :num',
      markerStatusUnanswered: 'unanswered',
      markerStatusCorrect: 'correct',
      markerStatusIncorrect: 'incorrect'
    }
  };

  function LabelTheImage(params, contentId, contentData) {
    Question.call(this, 'label-the-image');

    this.contentId = contentId;
    this.contentData = contentData || {};
    this.params = $.extend(true, {}, DEFAULTS, params);
    this.points = this.params.points || [];
    this.userAnswers = this.points.map(function () { return ''; });
    this.results = this.points.map(function () { return null; });
    this.answered = false;
    this.openPopoverIndex = null;

    if (this.contentData.previousState && Array.isArray(this.contentData.previousState.answers)) {
      var prev = this.contentData.previousState.answers;
      for (var i = 0; i < this.userAnswers.length; i++) {
        if (typeof prev[i] === 'string') this.userAnswers[i] = prev[i];
      }
    }
  }

  LabelTheImage.prototype = Object.create(Question.prototype);
  LabelTheImage.prototype.constructor = LabelTheImage;

  // ---- Answer matching ----------------------------------------------------

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var curr = [i];
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        curr[k] = Math.min(curr[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
      }
      prev = curr;
    }
    return prev[b.length];
  }

  LabelTheImage.prototype.matchAnswer = function (input, acceptedRaw, pointCaseSensitive) {
    var result = { correct: false, closeMatch: false };
    if (!input || !acceptedRaw) return result;

    var behaviour = this.params.behaviour;
    var caseSensitive = (pointCaseSensitive === true) || (pointCaseSensitive !== false && behaviour.caseSensitive);
    var normalize = function (s) {
      s = String(s).trim();
      return caseSensitive ? s : s.toLowerCase();
    };

    var given = normalize(input);
    var accepted = String(acceptedRaw).split('/').map(normalize).filter(Boolean);

    for (var i = 0; i < accepted.length; i++) {
      if (given === accepted[i]) {
        result.correct = true;
        return result;
      }
    }

    if (behaviour.acceptSpellingErrors) {
      for (var j = 0; j < accepted.length; j++) {
        var target = accepted[j];
        if (target.length < 4) continue;
        var threshold = Math.ceil(target.length / 10);
        if (levenshtein(given, target) <= threshold) {
          result.correct = true;
          result.closeMatch = true;
          return result;
        }
      }
    }

    return result;
  };

  // ---- Rendering ----------------------------------------------------------

  LabelTheImage.prototype.registerDomElements = function () {
    var self = this;
    if (this.params.taskDescription) {
      this.setIntroduction('<div class="h5p-label-the-image__intro">' + this.params.taskDescription + '</div>');
    }

    var mode = this.params.behaviour && this.params.behaviour.inputMode;
    this.inputMode = (mode === 'list' || mode === 'inline') ? mode : 'popover';

    this.$content = $('<div class="h5p-label-the-image__content h5p-label-the-image__content--' + this.inputMode + '"></div>');
    this.$imageWrapper = $('<div class="h5p-label-the-image__image-wrapper"></div>').appendTo(this.$content);

    var imageParams = this.params.image;
    if (imageParams && imageParams.path) {
      this.$image = $('<img class="h5p-label-the-image__image" />')
        .attr('src', H5P.getPath(imageParams.path, this.contentId))
        .attr('alt', this.params.backgroundImageAltText || '')
        .on('load', function () { self.trigger('resize'); })
        .appendTo(this.$imageWrapper);
      // If the image is already cached the load event may have fired
      // before the listener was attached. Force a resize on next tick
      // so the iframe height is recalculated either way.
      if (this.$image[0].complete) {
        setTimeout(function () { self.trigger('resize'); }, 0);
      }
    } else {
      this.$imageWrapper.append('<div class="h5p-label-the-image__no-image">No image configured.</div>');
    }

    this.$markerLayer = $('<div class="h5p-label-the-image__markers" aria-label="Markers"></div>').appendTo(this.$imageWrapper);
    this.$liveRegion = $('<div class="h5p-label-the-image__live" aria-live="polite" aria-atomic="true"></div>').appendTo(this.$content);

    if (this.inputMode === 'inline') {
      this.points.forEach(function (point, index) { self.renderInlineInput(point, index); });
    } else {
      this.points.forEach(function (point, index) { self.renderMarker(point, index); });
    }

    if (this.inputMode === 'list') {
      this.$answerList = $('<ol class="h5p-label-the-image__list"></ol>').appendTo(this.$content);
      this.points.forEach(function (point, index) { self.renderListRow(point, index); });
    }

    this.setContent(this.$content);
    this.addButtons();

    this.on('resize', function () { self.closePopover(); });

    // Safety net: H5P core measures the iframe height shortly after
    // setContent, which can race against the image load. Fire a few
    // additional resizes as fallback so the iframe always grows to
    // fit the final laid-out content.
    setTimeout(function () { self.trigger('resize'); }, 100);
    setTimeout(function () { self.trigger('resize'); }, 500);
  };

  LabelTheImage.prototype.renderListRow = function (point, index) {
    var self = this;
    var $row = $('<li class="h5p-label-the-image__list-row" data-index="' + index + '"></li>').appendTo(this.$answerList);
    $('<span class="h5p-label-the-image__list-num"></span>').text(index + 1).appendTo($row);

    var $body = $('<div class="h5p-label-the-image__list-body"></div>').appendTo($row);
    if (point.hint) {
      $('<div class="h5p-label-the-image__hint"></div>')
        .text((this.params.l10n.hintLabel || 'Hint') + ': ' + point.hint)
        .appendTo($body);
    }
    $('<input type="text" class="h5p-label-the-image__input" />')
      .attr('placeholder', this.params.l10n.answerPlaceholder || '')
      .attr('aria-label', (this.params.a11y.markerLabel || 'Label point :num').replace(':num', index + 1))
      .val(this.userAnswers[index] || '')
      .on('input', function () { self.userAnswers[index] = $(this).val(); })
      .on('focus', function () {
        var $marker = self.$markerLayer.find('.h5p-label-the-image__marker[data-index="' + index + '"]');
        $marker.addClass('is-focused');
      })
      .on('blur', function () {
        self.$markerLayer.find('.h5p-label-the-image__marker.is-focused').removeClass('is-focused');
      })
      .appendTo($body);

    $('<div class="h5p-label-the-image__row-feedback" aria-live="polite"></div>').appendTo($body);
  };

  LabelTheImage.prototype.renderInlineInput = function (point, index) {
    var self = this;
    var pos = point.position || point;
    var y = pos.y || 0;
    var markerLabel = (this.params.a11y.markerLabel || 'Label point :num').replace(':num', index + 1);

    // When the marker sits near the bottom of the image, show the
    // Correct / Incorrect chip above the input rather than below so it
    // doesn't get clipped by the image edge.
    var feedbackAbove = y > 75;

    var $wrap = $('<div class="h5p-label-the-image__inline" data-index="' + index + '"></div>')
      .attr('data-feedback-pos', feedbackAbove ? 'above' : 'below')
      .css({ left: (pos.x || 0) + '%', top: y + '%' })
      .appendTo(this.$markerLayer);

    $('<span class="h5p-label-the-image__inline-num"></span>').text(index + 1).appendTo($wrap);

    var $input = $('<input type="text" class="h5p-label-the-image__input h5p-label-the-image__inline-input" />')
      .attr('placeholder', this.params.l10n.answerPlaceholder || '')
      .attr('aria-label', markerLabel + (point.hint ? ' — ' + point.hint : ''))
      .val(this.userAnswers[index] || '')
      .on('input', function () { self.userAnswers[index] = $(this).val(); })
      .appendTo($wrap);

    if (point.hint) $input.attr('title', point.hint);

    $('<div class="h5p-label-the-image__inline-feedback" aria-live="polite"></div>').appendTo($wrap);
  };

  LabelTheImage.prototype.renderMarker = function (point, index) {
    var self = this;
    var markerLabel = (this.params.a11y.markerLabel || 'Label point :num').replace(':num', index + 1);

    var pos = point.position || point;
    var $marker = $('<button type="button" class="h5p-label-the-image__marker" data-index="' + index + '"></button>')
      .attr('aria-label', markerLabel)
      .css({ left: (pos.x || 0) + '%', top: (pos.y || 0) + '%' })
      .text(index + 1)
      .on('click', function (e) {
        e.preventDefault();
        if (self.inputMode === 'list') self.focusListRow(index);
        else self.togglePopover(index);
      })
      .on('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (self.inputMode === 'list') self.focusListRow(index);
          else self.togglePopover(index);
        }
      });

    this.$markerLayer.append($marker);
  };

  LabelTheImage.prototype.focusListRow = function (index) {
    if (!this.$answerList) return;
    var $row = this.$answerList.find('.h5p-label-the-image__list-row[data-index="' + index + '"]');
    $row[0] && $row[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $row.find('input').trigger('focus');
  };

  LabelTheImage.prototype.togglePopover = function (index) {
    if (this.openPopoverIndex === index) {
      this.closePopover();
    } else {
      this.openPopover(index);
    }
  };

  LabelTheImage.prototype.openPopover = function (index) {
    var self = this;
    this.closePopover();

    var point = this.points[index];
    var $marker = this.$markerLayer.find('.h5p-label-the-image__marker[data-index="' + index + '"]');

    var $popover = $('<div class="h5p-label-the-image__popover" role="dialog"></div>')
      .attr('aria-label', (this.params.a11y.markerLabel || '').replace(':num', index + 1));

    if (point.hint) {
      $('<div class="h5p-label-the-image__hint"></div>')
        .text((this.params.l10n.hintLabel || 'Hint') + ': ' + point.hint)
        .appendTo($popover);
    }

    var $input = $('<input type="text" class="h5p-label-the-image__input" />')
      .attr('placeholder', this.params.l10n.answerPlaceholder || '')
      .val(this.userAnswers[index] || '')
      .on('input', function () { self.userAnswers[index] = $(this).val(); });

    if (this.answered) $input.prop('disabled', true);

    $popover.append($input);

    var $feedback = $('<div class="h5p-label-the-image__popover-feedback" aria-live="polite"></div>').appendTo($popover);
    if (this.answered && this.results[index]) {
      this.renderPopoverFeedback($feedback, this.results[index], point);
    }

    var $close = $('<button type="button" class="h5p-label-the-image__close"></button>')
      .attr('aria-label', this.params.l10n.closeLabel || 'Close')
      .text('×')
      .on('click', function () { self.closePopover(); });
    $popover.append($close);

    $popover.on('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        self.closePopover();
        $marker.trigger('focus');
      }
    });

    this.$imageWrapper.append($popover);
    this.positionPopover($popover, $marker);

    this.openPopoverIndex = index;
    this.$openPopover = $popover;

    setTimeout(function () { $input.trigger('focus'); }, 0);
  };

  LabelTheImage.prototype.positionPopover = function ($popover, $marker) {
    var wrapperWidth = this.$imageWrapper.outerWidth();
    var markerPos = $marker.position();
    var markerWidth = $marker.outerWidth();
    var popoverWidth = $popover.outerWidth();

    var left = markerPos.left + markerWidth / 2 - popoverWidth / 2;
    left = Math.max(4, Math.min(left, wrapperWidth - popoverWidth - 4));
    var top = markerPos.top + $marker.outerHeight() + 8;

    $popover.css({ left: left + 'px', top: top + 'px' });
  };

  LabelTheImage.prototype.closePopover = function () {
    if (this.$openPopover) {
      this.$openPopover.remove();
      this.$openPopover = null;
    }
    this.openPopoverIndex = null;
  };

  LabelTheImage.prototype.renderPopoverFeedback = function ($container, result, point) {
    $container.empty();
    var cls = result.correct ? 'is-correct' : 'is-incorrect';
    var label = result.correct
      ? (result.closeMatch ? this.params.l10n.almost : this.params.l10n.correct)
      : this.params.l10n.incorrect;
    $container.addClass(cls).text(label);
    if (!result.correct && point.wrongAnswerFeedback) {
      $('<div class="h5p-label-the-image__wrong-feedback"></div>').text(point.wrongAnswerFeedback).appendTo($container);
    }
  };

  // ---- Buttons & lifecycle ------------------------------------------------

  LabelTheImage.prototype.addButtons = function () {
    var self = this;
    var b = this.params.behaviour;
    var l = this.params.l10n;

    if (b.enableCheckButton !== false) {
      this.addButton('check-answer', l.checkAnswer, function () { self.checkAnswers(); }, true, {}, { contentData: this.contentData, textIfSubmitting: l.submitAnswer });
    }
    if (b.enableSolutionsButton) {
      this.addButton('show-solution', l.showSolution, function () { self.showSolutions(); }, false);
    }
    if (b.enableRetry) {
      this.addButton('try-again', l.tryAgain, function () { self.resetTask(); }, false);
    }
  };

  LabelTheImage.prototype.checkAnswers = function () {
    var self = this;
    this.closePopover();
    this.answered = true;

    this.results = this.points.map(function (point, i) {
      return self.matchAnswer(self.userAnswers[i], point.answers, point.caseSensitive);
    });

    this.$markerLayer.find('.h5p-label-the-image__marker').each(function () {
      var idx = parseInt($(this).attr('data-index'), 10);
      var r = self.results[idx];
      $(this).removeClass('is-correct is-incorrect')
        .addClass(r && r.correct ? 'is-correct' : 'is-incorrect')
        .attr('aria-label', self.buildMarkerAriaLabel(idx, r));
    });

    if (this.$answerList) {
      this.$answerList.find('.h5p-label-the-image__list-row').each(function () {
        var idx = parseInt($(this).attr('data-index'), 10);
        var r = self.results[idx];
        var point = self.points[idx];
        $(this).find('input').prop('disabled', true);
        $(this).removeClass('is-correct is-incorrect');
        var $fb = $(this).find('.h5p-label-the-image__row-feedback').empty();
        if (r) {
          var cls = r.correct ? 'is-correct' : 'is-incorrect';
          $(this).addClass(cls);
          var label = r.correct
            ? (r.closeMatch ? self.params.l10n.almost : self.params.l10n.correct)
            : self.params.l10n.incorrect;
          $fb.removeClass('is-correct is-incorrect').addClass(cls).text(label);
          if (!r.correct && point.wrongAnswerFeedback) {
            $('<div class="h5p-label-the-image__wrong-feedback"></div>').text(point.wrongAnswerFeedback).appendTo($fb);
          }
        }
      });
    }

    if (this.inputMode === 'inline') {
      this.$markerLayer.find('.h5p-label-the-image__inline').each(function () {
        var idx = parseInt($(this).attr('data-index'), 10);
        var r = self.results[idx];
        var point = self.points[idx];
        $(this).find('input').prop('disabled', true);
        $(this).removeClass('is-correct is-incorrect');
        var $fb = $(this).find('.h5p-label-the-image__inline-feedback').empty();
        if (r) {
          var cls = r.correct ? 'is-correct' : 'is-incorrect';
          $(this).addClass(cls);
          var label = r.correct
            ? (r.closeMatch ? self.params.l10n.almost : self.params.l10n.correct)
            : self.params.l10n.incorrect;
          $fb.removeClass('is-correct is-incorrect').addClass(cls).text(label);
          if (!r.correct && point.wrongAnswerFeedback) {
            $('<div class="h5p-label-the-image__wrong-feedback"></div>').text(point.wrongAnswerFeedback).appendTo($fb);
          }
        }
      });
    }

    var score = this.getScore();
    var max = this.getMaxScore();
    var scoreText = (this.params.l10n.scoreBarLabel || '').replace(':num', score).replace(':total', max);
    this.setFeedback(scoreText, score, max, scoreText);

    this.hideButton('check-answer');
    if (this.params.behaviour.enableSolutionsButton) this.showButton('show-solution');
    if (this.params.behaviour.enableRetry) this.showButton('try-again');

    this.$liveRegion.text(scoreText);

    this.triggerXAPIAnswered();
  };

  LabelTheImage.prototype.buildMarkerAriaLabel = function (index, result) {
    var base = (this.params.a11y.markerLabel || 'Label point :num').replace(':num', index + 1);
    if (!result) return base + ' — ' + this.params.a11y.markerStatusUnanswered;
    return base + ' — ' + (result.correct ? this.params.a11y.markerStatusCorrect : this.params.a11y.markerStatusIncorrect);
  };

  LabelTheImage.prototype.showSolutions = function () {
    var self = this;
    this.closePopover();
    this.points.forEach(function (point, i) {
      var first = String(point.answers || '').split('/')[0].trim();
      self.userAnswers[i] = first;
    });
    if (this.$answerList) {
      this.$answerList.find('.h5p-label-the-image__list-row').each(function () {
        var idx = parseInt($(this).attr('data-index'), 10);
        $(this).find('input').val(self.userAnswers[idx]).prop('disabled', true);
      });
    }
    if (this.inputMode === 'inline') {
      this.$markerLayer.find('.h5p-label-the-image__inline').each(function () {
        var idx = parseInt($(this).attr('data-index'), 10);
        $(this).find('input').val(self.userAnswers[idx]).prop('disabled', true);
      });
    }
    this.hideButton('show-solution');
  };

  LabelTheImage.prototype.resetTask = function () {
    var self = this;
    this.closePopover();
    this.answered = false;
    this.userAnswers = this.points.map(function () { return ''; });
    this.results = this.points.map(function () { return null; });

    this.$markerLayer.find('.h5p-label-the-image__marker').each(function () {
      var idx = parseInt($(this).attr('data-index'), 10);
      $(this).removeClass('is-correct is-incorrect').attr('aria-label', self.buildMarkerAriaLabel(idx, null));
    });

    if (this.$answerList) {
      this.$answerList.find('.h5p-label-the-image__list-row').each(function () {
        $(this).removeClass('is-correct is-incorrect');
        $(this).find('input').val('').prop('disabled', false);
        $(this).find('.h5p-label-the-image__row-feedback').empty().removeClass('is-correct is-incorrect');
      });
    }

    if (this.inputMode === 'inline') {
      this.$markerLayer.find('.h5p-label-the-image__inline').each(function () {
        $(this).removeClass('is-correct is-incorrect');
        $(this).find('input').val('').prop('disabled', false);
        $(this).find('.h5p-label-the-image__inline-feedback').empty().removeClass('is-correct is-incorrect');
      });
    }

    this.removeFeedback();
    this.hideButton('show-solution');
    this.hideButton('try-again');
    if (this.params.behaviour.enableCheckButton !== false) this.showButton('check-answer');
  };

  LabelTheImage.prototype.getScore = function () {
    return this.results.reduce(function (sum, r) { return sum + (r && r.correct ? 1 : 0); }, 0);
  };

  LabelTheImage.prototype.getMaxScore = function () {
    return this.points.length;
  };

  LabelTheImage.prototype.getAnswerGiven = function () {
    return this.userAnswers.some(function (a) { return a && a.length; });
  };

  LabelTheImage.prototype.getCurrentState = function () {
    return { answers: this.userAnswers.slice() };
  };

  // ---- xAPI ---------------------------------------------------------------

  LabelTheImage.prototype.triggerXAPIAnswered = function () {
    var event = this.createXAPIEventTemplate('answered');
    var definition = event.getVerifiedStatementValue(['object', 'definition']);
    definition.description = { 'en-US': this.params.taskDescription || 'Label the image' };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'fill-in';
    definition.correctResponsesPattern = [
      this.points.map(function (p) { return String(p.answers || '').split('/')[0].trim(); }).join('[,]')
    ];

    event.setScoredResult(this.getScore(), this.getMaxScore(), this, true, this.getScore() === this.getMaxScore());
    event.data.statement.result.response = this.userAnswers.join('[,]');

    this.trigger(event);
  };

  LabelTheImage.prototype.getXAPIData = function () {
    var event = this.createXAPIEventTemplate('answered');
    var definition = event.getVerifiedStatementValue(['object', 'definition']);
    definition.description = { 'en-US': this.params.taskDescription || 'Label the image' };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'fill-in';
    definition.correctResponsesPattern = [
      this.points.map(function (p) { return String(p.answers || '').split('/')[0].trim(); }).join('[,]')
    ];
    event.setScoredResult(this.getScore(), this.getMaxScore(), this, true, this.getScore() === this.getMaxScore());
    event.data.statement.result.response = this.userAnswers.join('[,]');
    return { statement: event.data.statement };
  };

  return LabelTheImage;
})(H5P.jQuery, H5P.Question);
