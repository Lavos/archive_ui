define([
	'jquery', 'underscore', 'doubleunderscore', 'blocks',
	'text!./main.jst', 'text!./list.jst', 'text!./item.jst', 'text!./editor.jst',
	'css!./interface.css'
], function(
	$, _, __, Blocks,
	main_template_string, list_template_string, item_template_string, editor_template_string
){
	var Note = Blocks.Model.inherits(function(){
		this.data = {
			hex: '',
			title: '',
			revision_refs: []
		};
	}, {});

	var Notes = Blocks.Collection.inherits(function(){

	}, {});


	var List = Blocks.View.inherits(function(){
		var self = this;

		self.collection = new Notes();
		self.collection.on('change', self.render, self);

		self.items = [];
		self.selectedIndex = null;

		self.element.innerHTML = list_template_string;
		self.target = self.$element.find('.item_target')[0];
		self.$search = self.$element.find('.search');

		$(document).on('keyup', function(e){
			switch (e.which) {
			case 27: // esc
				self.$search.focus().select();
			break;
			};
		});
	}, {
		tag_name: 'nav',
		element_classes: 'list pane',

		events: [
			{ event_name: 'input', selector: '.search', function_name: 'search' },
			{ event_name: 'keydown', selector: '.search', function_name: 'key_handler' }
		],

		close_menu: function(){
			$('html').removeClass('menu_open');
		},

		render: function(){
			this.items = [];
			this.selectedIndex = null;

			var frag = document.createDocumentFragment();
			var counter = 0, limit = this.collection.length;
			while (counter < limit) {
				var item = new Item(this.collection[counter]);
				frag.appendChild(item.element);

				item.on('select', this.select, this);
				this.items.push(item);
				counter++;
			};

			this.target.innerHTML = '';
			this.target.appendChild(frag);
		},

		search: function(){
			var self = this;
			var q = this.$search.val();
	
			var success = function (data) {
				self.collection.removeAll();

				var counter = 0, limit = data.length;
				while (counter < limit) {
					var note = new Note();
					note.ingest(data[counter]);
					self.collection.push(note);
					counter++;
				};
			
			};

			if (q) {
				$.ajax({
					type: 'GET',
					url: '/api/search',
					dataType: 'json',
					data: { q: q },
					success: success
				});
			} else {
				$.ajax({
					type: 'GET',
					url: '/api/list',
					dataType: 'json',
					success: success
				});
			};
		},

		key_handler: function(e) {
			console.log(e.which);

			switch (e.which) {
			case 38: // up
				e.preventDefault();
				this.moveSelection(false);
			break;

			case 40: // down
				e.preventDefault();
				this.moveSelection(true);
			break;

			case 13: // enter
				e.preventDefault();

				if (this.selectedIndex !== null) {
					this.fire('leave');
					return;
				};

				this.make();
			};
		},

		moveSelection: function(positive) {
			if (this.selectedIndex === null) {
				this.selectedIndex = 0;
				this.items[this.selectedIndex].select();
				return;
			};

			var new_index = this.selectedIndex + (positive ? 1 : -1);

			if (new_index < 0) {
				new_index = this.items.length-1;
			};

			new_index = new_index % this.items.length;
			this.items[new_index].select();
		},

		make: function(){
			var self = this;

			var n = new Note();
			n.set('title', this.$search.val());

			$.ajax({
				type: 'POST',
				url: '/api/new',
				dataType: 'text',
				processData: false,
				data: JSON.stringify({ title: n.get('title') }),
				contentType: 'application/json',
				success: function(hex){
					n.set('hex', hex);
					self.collection.push(n);
					self.items[0].select();
				}
			});
		},

		select: function(item, model){
			if (this.selectedIndex !== null) {
				this.items[this.selectedIndex].setHighlight(false);
			};

			item.setHighlight(true);
			this.selectedIndex = this.items.indexOf(item);

			this.$search.val(model.get('title'));
			this.fire('select', model);
		}		
	});

	var Item = Blocks.View.inherits(function(model){
		this.model = model;
		this.model.on('change', this.render, this);

		this.render();
	}, {
		tag_name: 'article',
		comp_template: __.template(item_template_string),
		events: [
			{ event_name: 'click', selector: '*', function_name: 'select' },
		],

		render: function(){
			this.element.innerHTML = this.comp_template(this.model.data);
		},

		setHighlight: function(highlight){
			this.$element[highlight ? 'addClass' : 'removeClass']('highlight');
		},

		select: function(){
			this.fire('select', this.model);
		}
	});


	var Editor = Blocks.View.inherits(function(){
		this.model = new Note();

		this.textarea = document.createElement('textarea');
		this.element.appendChild(this.textarea);
		this.textarea.id = 'editor';
		this.$textarea = $(this.textarea);

		this.$info = this.$element.find('span.info');

		this.render();
	}, {
		content_timer: null,
		tag_name: 'section',
		element_classes: 'editor pane',
		comp_template: __.template(editor_template_string),

		events: [
			{ event_name: 'input', selector: 'textarea', function_name: 'content_handler' },
		],

		clear: function(){
			if (this.content_timer) {
				clearTimeout(this.content_timer);
				this.content_timer = null;
				this.save();
			};

			this.$info.html('');
			this.$textarea.val('');
		},

		display_revision: function (hex) {
			var self = this;

			$.ajax({
				type: 'GET',
				url: '/api/' + hex,
				dataType: 'text',
				success: function (data) {
					self.$textarea.val(data);
				},
			});
		},

		content_handler: function () {
			var self = this;

			if (this.content_timer) {
				clearTimeout(this.content_timer);
			};

			this.content_timer = setTimeout(function(){
				self.content_timer = null;
				self.save();
				self.once('save', function(){ self.render(); });
			}, 2000);
		},

		edit: function(item, model){
			this.clear();

			this.model = model;

			var ref = this.model.get('revision_refs') || [];

			if (ref.length) {
				this.display_revision(ref[ref.length-1]);
			};
		},

		patch: function(){
			var self = this;

			if (self.model.get('hex') === '') {
				return;
			};

			$.ajax({
				type: 'PATCH',
				url: '/api/' + self.model.get('hex'),
				dataType: 'text',
				processData: false,
				data: JSON.stringify({ title: self.$title.val() }),
				contentType: 'application/json',
				success: function(){
					self.model.set('title', self.$title.val());
				},
			});
		},

		save: function(){
			var self = this;

			$.ajax({
				type: 'POST',
				url: '/api/' + self.model.get('hex'),
				dataType: 'text',
				processData: false,
				data: self.$textarea.val(),
				contentType: 'application/json',
				success: function (data) {
					var revs = self.model.get('revision_refs').slice();
					revs.push(data);
					self.model.set('revision_refs', revs);
					self.fire('save', data);
				},
			});
		}
	});

	var Interface = Blocks.View.inherits(function(){
		this.element.innerHTML = main_template_string;

		this.editor = new Editor();
		this.list = new List();

		// this.list.on('select', this.watch, this);
		this.list.on('select', this.editor.edit, this.editor);
		this.list.on('leave', this.editor.edit, this.editor);

		// this.editor.on('save', this.update_revisions, this);

		this.element.appendChild(this.list.element);
		this.element.appendChild(this.editor.element);

		this.$revisions = this.$element.find('select.revisions');

		this.context = null;
	}, {
		element_classes: 'notes_interface',

		events: [
			{ event_name: 'click', selector: '[data-action="menu"]', function_name: 'menu' },
			{ event_name: 'change', selector: 'select.revisions', function_name: 'select_revision' }
		],

		watch: function(item, model) {
			if (this.context) {
				this.context.off('change', this.update_revisions);
			};

			this.context = model;
			this.context.on('change', this.update_revisions, this);
			
			var revs = this.context.get('revision_refs'), counter = revs.length;
			var last = revs[revs.length-1];

			if (last) {
				this.editor.display_revision(last);
			};

			this.update_revisions();
		},

		update_revisions: function() {
			console.log('update!');

			var revs = this.context.get('revision_refs'), counter = revs.length;
			var last = revs[revs.length-1];
			this.$revisions.html('');

			if (last) {
				var frag = document.createDocumentFragment();

				while (counter--) {
					var option = document.createElement('option');
					var current = revs[counter];

					option.value = current;
					option.innerHTML = current.substr(0, 7);

					if (current === last) {
						option.selected = true;
					};

					frag.appendChild(option);
				};

				this.$revisions.append(frag);
			};
		},

		select_revision: function() {
			console.log('SELECT');
			this.editor.display_revision(this.$revisions.val());
		},

		menu: function(){
			$('html').toggleClass('menu_open');
		}
	});


	return Interface;
});
