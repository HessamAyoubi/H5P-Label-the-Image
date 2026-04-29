/**
 * ImageCoordinateSelector widget module
 *
 * @param {H5P.jQuery} $
 */
H5PEditor.widgets.imageCoordinateSelector = H5PEditor.ImageCoordinateSelector = (function ($) {

  // Every active widget instance registers here so each one can find its
  // siblings without depending on H5PEditor's parent-chain shape (which
  // varies by wrapper widget — VerticalTabs, list, group, etc.).
  var registry = [];

  /**
   * Creates an image coordinate selector.
   *
   * @class H5PEditor.ImageCoordinateSelector
   *
   * @param {Object} parent
   * @param {Object} field
   * @param {Object} params
   * @param {function} setValue
   *
   * @throws {Error} If no image field is found
   */
  function ImageCoordinateSelector(parent, field, params, setValue) {
    var self = this;

    this.parent = parent;
    this.field = field;
    this.params = params;
    this.setValue = setValue;

    registry.push(this);
    this.legacyPositioning = false;
    if (params && params.legacyPositioning === true) {
      this.legacyPositioning = true;
    }

    this.imageField = H5PEditor.findField(this.field.imageFieldPath, this.parent);

    if (this.imageField === undefined) {
      throw new Error('I need an image field to do my job');
    }

    var resizeText = H5PEditor.t('H5PEditor.ImageCoordinateSelector', 'resize');

    self.$container = $(H5PEditor.createFieldMarkup(this.field,
      '<div class="image-coordinate-numeric">' +
        '<label class="image-coordinate-numeric__field">' +
          '<span>X (%)</span>' +
          '<input type="number" class="image-coordinate-numeric__x" min="0" max="100" step="0.1" />' +
        '</label>' +
        '<label class="image-coordinate-numeric__field">' +
          '<span>Y (%)</span>' +
          '<input type="number" class="image-coordinate-numeric__y" min="0" max="100" step="0.1" />' +
        '</label>' +
        '<span class="image-coordinate-numeric__hint">Type exact percentages, or click on the image below.</span>' +
      '</div>' +
      '<div class="image-coordinate-selector">' +
        '<div class="image-coordinate-hotspot"></div>' +
      '</div>' +
      '<button aria-label="' + resizeText + '" ' +
              'title="' + resizeText + '" ' +
              'class="image-coordinate-resizer fa fa-search-plus"' +
      '></button>')
    ).addClass('no-image');

    self.$xInput = self.$container.find('.image-coordinate-numeric__x');
    self.$yInput = self.$container.find('.image-coordinate-numeric__y');

    function commitFromInputs() {
      var x = self.fixPercent(parseFloat(self.$xInput.val()));
      var y = self.fixPercent(parseFloat(self.$yInput.val()));
      self.legacyPositioning = false;
      self.saveCoordinate(x, y);
    }
    self.$xInput.on('change input', commitFromInputs);
    self.$yInput.on('change input', commitFromInputs);

    var SNAP_THRESHOLD = 2; // percent of image dimension
    self.$imgContainer = self.$container.find('.image-coordinate-selector');

    function rawCoordsFromEvent(event) {
      var offset = self.$imgContainer.offset();
      var x = event.pageX - offset.left;
      var y = event.pageY - offset.top;
      return {
        x: self.fixPercent((x / self.$imgContainer.width()) * 100),
        y: self.fixPercent((y / self.$imgContainer.height()) * 100)
      };
    }

    self.$imgContainer
      .on('click', function (event) {
        var raw = rawCoordsFromEvent(event);
        var snapped = event.altKey ? raw : self.applySnap(raw.x, raw.y, SNAP_THRESHOLD);
        // We don't use legacy positioning for new clicks
        self.legacyPositioning = false;
        self.saveCoordinate(snapped.x, snapped.y);
        self.hideGuides();
        self.renderGhostMarkers();
      })
      .on('mouseenter', function () {
        self.renderGhostMarkers();
        if (!self._snapLogged) {
          self._snapLogged = true;
          var siblings = self.findSiblingPositions();
          // eslint-disable-next-line no-console
          console.log('[ImageCoordinateSelector] siblings detected:', siblings.length, siblings);
        }
      })
      .on('mousemove', function (event) {
        var raw = rawCoordsFromEvent(event);
        var snapped = event.altKey ? { x: raw.x, y: raw.y, snappedX: false, snappedY: false }
                                   : self.applySnap(raw.x, raw.y, SNAP_THRESHOLD);
        self.showGuides(snapped);
      })
      .on('mouseleave', function () {
        self.hideGuides();
      });

    // Render ghost markers as soon as the image is ready so authors
    // can see existing points without having to mouseenter first.
    setTimeout(function () { self.renderGhostMarkers(); }, 0);

    self.$imgContainer.on('transitionend', function () {
      if (self.$imgContainer.hasClass('image-coordinate-wider')) {
        self.$imgContainer.addClass('transition-complete');
      }
      else {
        self.$imgContainer.removeClass('transition-complete');
      }
    });

    self.$container.find('.image-coordinate-resizer').click(function () {
      var $this = $(this);
      if (self.$imgContainer.hasClass('image-coordinate-wider')) {
        $this.addClass('fa-search-plus');
        $this.removeClass('fa-search-minus');
        self.$imgContainer.removeClass('image-coordinate-wider');
      }
      else {
        $this.removeClass('fa-search-plus');
        $this.addClass('fa-search-minus');
        self.$imgContainer.addClass('image-coordinate-wider');
      }
    });

    self.$hotspot = self.$container.find('.image-coordinate-hotspot');

    // H5PEditor.followField() does not work for the first element in list.
    // At least not thwe way it is used in Image Hotspots. Teherfore using changes
    // array directly.
    this.imageField.changes.push(function () {
      var params = self.imageField.params;
      if (params === undefined) {
        return self.clearImage();
      }

      self.updateImage(params.path);
    });

    if (self.imageField.params && self.imageField.params.path) {
      self.updateImage(self.imageField.params.path);
    }

    // If params not set, use default values:
    if (params === undefined || params.x === undefined || params.y === undefined) {
      this.saveCoordinate(50, 50);
    }
    else {
      self.updateHotspot(self.params.x, self.params.y);
      self.syncNumericInputs(self.params.x, self.params.y);
    }
  }

  /**
   * Append the field to the wrapper.
   *
   * @param {H5P.jQuery} $wrapper
   */
  ImageCoordinateSelector.prototype.appendTo = function ($wrapper) {
    this.$container.appendTo($wrapper);
  };

  /**
   * Save coordinates
   *
   * @param {Number} x Value in percent
   * @param {Number} y Value in percent
   */
  ImageCoordinateSelector.prototype.saveCoordinate = function (x, y) {
    // Save the value
    this.params = {x: x, y: y};
    if (self.legacyPositioning === true) {
      this.params.legacyPositioning = true;
    }
    this.setValue(this.field, this.params);

    // Set visual element
    this.updateHotspot(x, y);
    this.syncNumericInputs(x, y);
  };

  /**
   * Mirror the saved coordinate into the numeric inputs without
   * retriggering the input change handler.
   */
  ImageCoordinateSelector.prototype.syncNumericInputs = function (x, y) {
    if (!this.$xInput || !this.$yInput) return;
    var fmt = function (n) { return Math.round(n * 10) / 10; };
    if (document.activeElement !== this.$xInput[0]) this.$xInput.val(fmt(x));
    if (document.activeElement !== this.$yInput[0]) this.$yInput.val(fmt(y));
  };

  /**
   * Update image
   *
   * @param {String} path Image path
   */
  ImageCoordinateSelector.prototype.updateImage = function (path) {
    if (this.imgPath === path) {
      return;
    }
    this.imgPath = path;

    // Remove image if present
    this.clearImage();
    // Create image
    this.$imgContainer.append('<img src="' + H5P.getPath(path, H5PEditor.contentId) + '">');
    this.$container.removeClass('no-image');
  };

  /**
   * Remove image
   */
  ImageCoordinateSelector.prototype.clearImage = function () {
    this.$imgContainer.find('img').remove();
    this.$container.addClass('no-image');
  };

  /**
   * Update visual hotspot placement
   *
   * @param {Number} x Value in percent
   * @param {Number} y Value in percent
   */
  ImageCoordinateSelector.prototype.updateHotspot = function (x, y) {
    // Set visual element
    var left = x + '%';
    var top = y + '%';
    if (!this.legacyPositioning) {
      left += ' - 5px';
      top += ' - 5px';
    }
    this.$hotspot.css({
      left: 'calc(' + left + ')',
      top: 'calc(' + top + ')',
      display: 'block'
    });
  };

  /**
   * Making sure percent is an integer between 0 and 100
   *
   * @param {Number} percent
   * @returns {Number}
   */
  ImageCoordinateSelector.prototype.fixPercent = function (percent) {
    if (isNaN(percent)) {
      percent = 50;
    }
    return percent < 0 ? 0 : (percent > 100 ? 100 : percent);
  };


  /**
   * Walk up the parent chain to find the list of sibling positions.
   * Returns an array of {x, y} objects from every other point in the
   * same list. Excludes this widget's own params.
   */
  ImageCoordinateSelector.prototype.findSiblingPositions = function () {
    var siblings = [];
    for (var i = 0; i < registry.length; i++) {
      var w = registry[i];
      if (w === this) continue;
      var p = w.params;
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      siblings.push({ x: p.x, y: p.y });
    }
    return siblings;
  };

  /**
   * Snap a raw click position to the nearest sibling X and/or Y if it
   * falls within `threshold` percent. X and Y snap independently so a
   * cursor can snap onto a sibling's row while keeping its own column.
   */
  ImageCoordinateSelector.prototype.applySnap = function (rawX, rawY, threshold) {
    var siblings = this.findSiblingPositions();
    var result = { x: rawX, y: rawY, snappedX: false, snappedY: false };
    var bestDx = threshold, bestDy = threshold;
    for (var i = 0; i < siblings.length; i++) {
      var dx = Math.abs(siblings[i].x - rawX);
      var dy = Math.abs(siblings[i].y - rawY);
      if (dx < bestDx) { result.x = siblings[i].x; bestDx = dx; result.snappedX = true; }
      if (dy < bestDy) { result.y = siblings[i].y; bestDy = dy; result.snappedY = true; }
    }
    return result;
  };

  /**
   * Render faint dots for all sibling positions on the preview so the
   * author can see where existing points sit while placing a new one.
   */
  ImageCoordinateSelector.prototype.renderGhostMarkers = function () {
    var $container = this.$imgContainer;
    $container.find('.image-coordinate-ghost').remove();
    var siblings = this.findSiblingPositions();
    for (var i = 0; i < siblings.length; i++) {
      $('<div class="image-coordinate-ghost"></div>').css({
        left: 'calc(' + siblings[i].x + '% - 4px)',
        top:  'calc(' + siblings[i].y + '% - 4px)'
      }).appendTo($container);
    }
  };

  /**
   * Show or hide the snap guide lines for the current snapped state.
   */
  ImageCoordinateSelector.prototype.showGuides = function (snap) {
    var $container = this.$imgContainer;
    var $guideV = $container.find('.image-coordinate-guide--v');
    var $guideH = $container.find('.image-coordinate-guide--h');
    if (snap.snappedX) {
      if (!$guideV.length) {
        $guideV = $('<div class="image-coordinate-guide image-coordinate-guide--v"></div>').appendTo($container);
      }
      $guideV.css({ left: snap.x + '%' }).show();
    } else {
      $guideV.hide();
    }
    if (snap.snappedY) {
      if (!$guideH.length) {
        $guideH = $('<div class="image-coordinate-guide image-coordinate-guide--h"></div>').appendTo($container);
      }
      $guideH.css({ top: snap.y + '%' }).show();
    } else {
      $guideH.hide();
    }
  };

  ImageCoordinateSelector.prototype.hideGuides = function () {
    this.$imgContainer.find('.image-coordinate-guide').hide();
  };

  /**
   * Validate the current values. Invoked by core
   *
   * @returns {Boolean} Valid or not
   */
  ImageCoordinateSelector.prototype.validate = function () {
    return this.params !== undefined && this.params.x !== undefined && this.params.y !== undefined &&
           this.params.x >= 0 && this.params.x <= 100 &&
           this.params.y >= 0 && this.params.y <= 100;
  };

  /**
   * Remove me. Invoked by core
   */
  ImageCoordinateSelector.prototype.remove = function () {
    var idx = registry.indexOf(this);
    if (idx !== -1) registry.splice(idx, 1);
    this.$imgContainer.remove();
  };

  return ImageCoordinateSelector;
})(H5P.jQuery);
