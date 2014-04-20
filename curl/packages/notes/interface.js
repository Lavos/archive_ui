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
			{ event_name: 'click', selector: '[data-action="new"]', function_name: 'make' }
		],

		close_menu: function(){
			$('html').removeClass('menu_open');
		},

		render: function(){
			var frag = document.createDocumentFragment();
			var counter = 0, limit = this.collection.length;
			while (counter < limit) {
				var item = new Item(this.collection[counter]);
				frag.appendChild(item.element);

				item.on('select', this.select, this);
				counter++;
			};

			this.target.innerHTML = '';
			this.target.appendChild(frag);
		},

		search: function(){
			var self = this;
			var q = this.$search.val();
	
			if (q) {
				$.ajax({
					type: 'GET',
					url: '/api/search',
					dataType: 'json',
					data: { q: q },
					success: function (data) {
						self.collection.removeAll();

						var counter = 0, limit = data.length;
						while (counter < limit) {
							var note = new Note();
							note.ingest(data[counter]);
							self.collection.push(note);
							counter++;
						};
					
					}
				});
			} else {
				self.collection.removeAll();
			};
		},

		make: function(){
			var n = new Note();
			n.set('title', this.$search.val());

			this.fire('select', n);
			this.close_menu();
		},

		select: function(item, model){
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

		select: function(){
			$('html').removeClass('menu_open');
			this.fire('select', this.model);
		}
	});

	var Editor = Blocks.View.inherits(function(){
		this.model = new Note();

		this.element.innerHTML = this.comp_template(this.model);
		this.$textarea = this.$element.find('textarea.content');
		this.$title = this.$element.find('input.title');
		this.$info = this.$element.find('span.info');

		this.render();
	}, {
		title_timer: null,
		content_timer: null,
		tag_name: 'section',
		element_classes: 'editor pane',
		comp_template: __.template(editor_template_string),

		events: [
			{ event_name: 'input', selector: 'textarea.content', function_name: 'content_handler' },
			{ event_name: 'input', selector: 'input.title', function_name: 'update' }
		],

		clear: function(){
			if (this.title_timer) {
				clearTimeout(this.title_timer);
				this.title_timer = null;
				this.patch();
			};

			if (this.content_timer) {
				clearTimeout(this.content_timer);
				this.content_timer = null;
				this.save();
			};

			this.$title.val('');
			this.$info.html('');
			this.$textarea.val('');
		},

		update: function(){
			this.model.set('title', this.$title.val());
		},

		render: function(){
			this.$title.val(this.model.get('title'));
			this.$info.html(this.model.get('hex').substr(0, 7));
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

		title_handler: function (model, changes) {
			var self = this;

			console.log(changes);

			if (changes.title) {
				if (this.title_timer) {
					clearTimeout(this.title_timer);
				};

				this.title_timer = setTimeout(function(){
					self.title_timer = null;
					self.patch();
				}, 2000);
			};
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

			if (this.model) {
				this.model.off('changes', this.title_handler);
			};

			this.model = model;
			this.model.on('changes', this.title_handler, this);

			this.render();
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
			var queue = new __.Queue();

			// check if new note
			if (this.model.get('hex') === '') {
				self.model.set('title', self.$title.val());

				queue.add(function(){
					$.ajax({
						type: 'POST',
						url: '/api/new',
						dataType: 'text',
						processData: false,
						data: JSON.stringify({ title: self.model.get('title') }),
						contentType: 'application/json',
						success: function(hex){
							self.model.set('hex', hex);
							queue.step();
						}
					});
				});
			} else if (this.model.get('title') === '') {
				return;
			};

			queue.add(function(){
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
						queue.step();
					},
				});
			});

			queue.step();
		}
	});

	var Interface = Blocks.View.inherits(function(){
		this.element.innerHTML = main_template_string;

		this.editor = new Editor();
		this.list = new List();

		this.list.on('select', this.watch, this);
		this.list.on('select', this.editor.edit, this.editor);

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
