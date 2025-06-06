console.log('Executing src/renderer/renderer.js');
const { ipcRenderer } = require('electron');

class GenomeBrowser {
    constructor() {
        this.currentFile = null;
        this.currentSequence = {};
        this.currentAnnotations = {};
        this.currentVariants = {};
        this.currentReads = {};
        this.currentPosition = { start: 0, end: 1000 };
        this.igvBrowser = null;
        this.searchResults = [];
        this.currentSearchIndex = 0;
        this.zoomLevel = 1;
        this.genes = [];
        
        // Default visible tracks - show Genes & Features and GC Content by default
        this.visibleTracks = new Set(['genes', 'gc', 'bottomSequence']);
        
        // Separate control for bottom sequence display
        this.showBottomSequence = true;
        
        // Gene filter settings - hide "gene" features by default since they're represented by CDS, ncRNA, etc.
        this.geneFilters = {
            genes: false,  // Hide gene features by default
            CDS: true,
            mRNA: true,
            tRNA: true,
            rRNA: true,
            promoter: true,
            terminator: true,
            regulatory: true,
            other: true
        };
        
        this._cachedCharWidth = null; // Cache for character width measurement
        this.selectedGene = null; // Track currently selected gene
        
        // User-defined features storage
        this.userDefinedFeatures = {}; // Organized by chromosome
        this.currentSequenceSelection = null; // Track current sequence selection
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupIPC();
        this.updateStatus('Ready');
        
        // Make this instance globally available for action buttons
        window.genomeBrowser = this;
        
        this.initializeSplitter(); // Assuming this handles the main vertical splitter
        this.initializeHorizontalSplitter();
        
        // Initialize user-defined features functionality
        this.initializeUserFeatures();
        
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });

        // Cache original flex-basis for genomeViewerSection
        const genomeViewerSection = document.getElementById('genomeViewerSection');
        if (genomeViewerSection && !genomeViewerSection.dataset.originalFlexBasis) {
            genomeViewerSection.dataset.originalFlexBasis = getComputedStyle(genomeViewerSection).flexBasis || '50%';
        }
        
        // Reposition welcome screen to cover entire viewer container
        this.repositionWelcomeScreen();
        
        // Set initial panel layout
        this.updateBottomSequenceVisibility(); 
    }

    repositionWelcomeScreen() {
        const welcomeScreen = document.querySelector('.welcome-screen');
        const viewerContainer = document.getElementById('viewerContainer');
        
        if (welcomeScreen && viewerContainer) {
            // Remove welcome screen from its current location (inside genome-viewer)
            welcomeScreen.remove();
            
            // Add it as the first child of viewer-container so it covers everything
            viewerContainer.insertBefore(welcomeScreen, viewerContainer.firstChild);
            
            console.log('Welcome screen repositioned to cover entire viewer container');
        }
    }

    handleWindowResize() {
        // Recalculate sequence display if visible
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            // Check if the bottom sequence panel is supposed to be shown
            if (this.showBottomSequence) { 
                this.displayEnhancedSequence(currentChr, this.currentSequence[currentChr]);
            }
        }
    }

    setupEventListeners() {
        // File operations - dropdown menu
        document.getElementById('openFileBtn').addEventListener('click', () => this.toggleFileDropdown());
        document.getElementById('openGenomeBtn').addEventListener('click', () => this.openSpecificFileType('genome'));
        document.getElementById('openAnnotationBtn').addEventListener('click', () => this.openSpecificFileType('annotation'));
        document.getElementById('openVariantBtn').addEventListener('click', () => this.openSpecificFileType('variant'));
        document.getElementById('openReadsBtn').addEventListener('click', () => this.openSpecificFileType('reads'));
        document.getElementById('openAnyBtn').addEventListener('click', () => this.openSpecificFileType('any'));

        // Welcome screen buttons
        document.getElementById('welcomeOpenGenomeBtn').addEventListener('click', () => this.openSpecificFileType('genome'));
        document.getElementById('welcomeOpenAnnotationBtn').addEventListener('click', () => this.openSpecificFileType('annotation'));
        document.getElementById('welcomeOpenVariantBtn').addEventListener('click', () => this.openSpecificFileType('variant'));
        document.getElementById('welcomeOpenReadsBtn').addEventListener('click', () => this.openSpecificFileType('reads'));

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.file-menu-container')) {
                this.closeFileDropdown();
            }
            
            // Auto-hide toggle panels when clicking outside
            if (!e.target.closest('#toggleTracks') && !e.target.closest('#trackCheckboxes')) {
                this.hideTracksPanel();
            }
            
            if (!e.target.closest('#toggleFeatureFilters') && !e.target.closest('#featureFilterCheckboxes')) {
                this.hideFeatureFiltersPanel();
            }
        });

        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.showSearchModal());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.quickSearch();
        });

        // Position navigation
        document.getElementById('goToBtn').addEventListener('click', () => this.goToPosition());
        document.getElementById('positionInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.goToPosition();
        });

        // Navigation controls (sidebar)
        document.getElementById('prevBtn').addEventListener('click', () => this.navigatePrevious());
        document.getElementById('nextBtn').addEventListener('click', () => this.navigateNext());

        // Navigation controls (genome view)
        document.getElementById('prevBtnGenome').addEventListener('click', () => this.navigatePrevious());
        document.getElementById('nextBtnGenome').addEventListener('click', () => this.navigateNext());

        // Zoom controls
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetZoomBtn').addEventListener('click', () => this.resetZoom());

        // Sequence controls
        document.getElementById('copySequenceBtn').addEventListener('click', () => this.copySequence());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportSequence());

        // Sequence panel toggle
        document.getElementById('toggleSequencePanel').addEventListener('click', () => this.toggleSequencePanel());

        // Modal controls
        this.setupModalControls();

        // Chromosome selection
        document.getElementById('chromosomeSelect').addEventListener('change', (e) => {
            this.selectChromosome(e.target.value);
        });

        // Track selection (toolbar checkboxes)
        document.getElementById('trackGenes').addEventListener('change', () => this.updateVisibleTracks());
        document.getElementById('trackGC').addEventListener('change', () => this.updateVisibleTracks());
        document.getElementById('trackVariants').addEventListener('change', () => this.updateVisibleTracks());
        document.getElementById('trackReads').addEventListener('change', () => this.updateVisibleTracks());
        document.getElementById('trackProteins').addEventListener('change', () => this.updateVisibleTracks());
        document.getElementById('trackBottomSequence').addEventListener('change', () => this.updateBottomSequenceVisibility());

        // Sidebar track controls
        document.getElementById('sidebarTrackGenes').addEventListener('change', () => this.updateVisibleTracksFromSidebar());
        document.getElementById('sidebarTrackGC').addEventListener('change', () => this.updateVisibleTracksFromSidebar());
        document.getElementById('sidebarTrackVariants').addEventListener('change', () => this.updateVisibleTracksFromSidebar());
        document.getElementById('sidebarTrackReads').addEventListener('change', () => this.updateVisibleTracksFromSidebar());
        document.getElementById('sidebarTrackProteins').addEventListener('change', () => this.updateVisibleTracksFromSidebar());
        document.getElementById('sidebarTrackBottomSequence').addEventListener('change', () => this.updateBottomSequenceVisibilityFromSidebar());

        // Panel close buttons
        document.querySelectorAll('.close-panel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const panelId = e.target.closest('.close-panel-btn').dataset.panel;
                this.closePanel(panelId);
            });
        });

        // Feature filter toggle button
        document.getElementById('toggleFeatureFilters').addEventListener('click', () => {
            this.toggleFeatureFilters();
        });

        // Toolbar feature filter controls
        document.getElementById('showGenes').addEventListener('change', (e) => {
            this.geneFilters.genes = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowGenes', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showCDS').addEventListener('change', (e) => {
            this.geneFilters.CDS = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowCDS', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showMRNA').addEventListener('change', (e) => {
            this.geneFilters.mRNA = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowMRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showTRNA').addEventListener('change', (e) => {
            this.geneFilters.tRNA = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowTRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showRRNA').addEventListener('change', (e) => {
            this.geneFilters.rRNA = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowRRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showPromoter').addEventListener('change', (e) => {
            this.geneFilters.promoter = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowPromoter', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showTerminator').addEventListener('change', (e) => {
            this.geneFilters.terminator = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowTerminator', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showRegulatory').addEventListener('change', (e) => {
            this.geneFilters.regulatory = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowRegulatory', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('showOther').addEventListener('change', (e) => {
            this.geneFilters.other = e.target.checked;
            this.syncSidebarFeatureFilter('sidebarShowOther', e.target.checked);
            this.updateGeneDisplay();
        });

        // Sidebar feature filter controls
        document.getElementById('sidebarShowGenes').addEventListener('change', (e) => {
            this.geneFilters.genes = e.target.checked;
            this.syncToolbarFeatureFilter('showGenes', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowCDS').addEventListener('change', (e) => {
            this.geneFilters.CDS = e.target.checked;
            this.syncToolbarFeatureFilter('showCDS', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowMRNA').addEventListener('change', (e) => {
            this.geneFilters.mRNA = e.target.checked;
            this.syncToolbarFeatureFilter('showMRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowTRNA').addEventListener('change', (e) => {
            this.geneFilters.tRNA = e.target.checked;
            this.syncToolbarFeatureFilter('showTRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowRRNA').addEventListener('change', (e) => {
            this.geneFilters.rRNA = e.target.checked;
            this.syncToolbarFeatureFilter('showRRNA', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowPromoter').addEventListener('change', (e) => {
            this.geneFilters.promoter = e.target.checked;
            this.syncToolbarFeatureFilter('showPromoter', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowTerminator').addEventListener('change', (e) => {
            this.geneFilters.terminator = e.target.checked;
            this.syncToolbarFeatureFilter('showTerminator', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowRegulatory').addEventListener('change', (e) => {
            this.geneFilters.regulatory = e.target.checked;
            this.syncToolbarFeatureFilter('showRegulatory', e.target.checked);
            this.updateGeneDisplay();
        });
        document.getElementById('sidebarShowOther').addEventListener('change', (e) => {
            this.geneFilters.other = e.target.checked;
            this.syncToolbarFeatureFilter('showOther', e.target.checked);
            this.updateGeneDisplay();
        });

        // Toggle buttons for toolbar sections
        document.getElementById('toggleTracks').addEventListener('click', () => {
            this.toggleTracks();
        });
        
        // Sidebar toggle button
        document.getElementById('toggleSidebar').addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // Splitter toggle button
        document.getElementById('splitterToggleBtn').addEventListener('click', () => {
            this.toggleSidebarFromSplitter();
        });
        
        // Floating toggle button
        document.getElementById('floatingToggleBtn').addEventListener('click', () => {
            this.toggleSidebarFromSplitter();
        });
    }

    setupModalControls() {
        // Search modal
        const searchModal = document.getElementById('searchModal');
        const gotoModal = document.getElementById('gotoModal');

        // Close modal handlers
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('show');
            });
        });

        // Modal search
        document.getElementById('modalSearchBtn').addEventListener('click', () => {
            this.performSearch();
        });

        // Modal goto
        document.getElementById('modalGotoBtn').addEventListener('click', () => {
            this.performGoto();
        });

        // Close modals on outside click
        [searchModal, gotoModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
    }

    setupIPC() {
        // Handle file opened from main process
        ipcRenderer.on('file-opened', (event, filePath) => {
            this.loadFile(filePath);
        });

        // Handle menu actions
        ipcRenderer.on('show-search', () => {
            this.showSearchModal();
        });

        ipcRenderer.on('show-goto', () => {
            this.showGotoModal();
        });

        // Handle panel management
        ipcRenderer.on('show-panel', (event, panelId) => {
            this.showPanel(panelId);
        });

        ipcRenderer.on('show-all-panels', () => {
            this.showAllPanels();
        });
    }

    async openFile() {
        // This will trigger the main process to show file dialog
        // The result will come back via IPC
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.fasta,.fa,.gff,.gtf,.bed,.vcf,.bam,.sam,.gb,.gbk,.genbank';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.loadFile(e.target.files[0].path);
            }
        };
        input.click();
    }

    toggleFileDropdown() {
        const dropdown = document.getElementById('fileDropdownMenu');
        dropdown.classList.toggle('show');
    }

    closeFileDropdown() {
        const dropdown = document.getElementById('fileDropdownMenu');
        dropdown.classList.remove('show');
    }

    openSpecificFileType(fileType) {
        this.closeFileDropdown();
        
        const input = document.createElement('input');
        input.type = 'file';
        
        // Set specific file filters based on type
        switch (fileType) {
            case 'genome':
                input.accept = '.fasta,.fa,.gb,.gbk,.genbank';
                break;
            case 'annotation':
                input.accept = '.gff,.gtf,.bed';
                break;
            case 'variant':
                input.accept = '.vcf';
                break;
            case 'reads':
                input.accept = '.sam,.bam';
                break;
            case 'any':
            default:
                input.accept = '.fasta,.fa,.gff,.gtf,.bed,.vcf,.bam,.sam,.gb,.gbk,.genbank';
                break;
        }
        
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.loadFile(e.target.files[0].path);
            }
        };
        input.click();
    }

    async loadFile(filePath) {
        this.showLoading(true);
        this.updateStatus('Loading file...');

        try {
            // Get file info
            const fileInfo = await ipcRenderer.invoke('get-file-info', filePath);
            if (!fileInfo.success) {
                throw new Error(fileInfo.error);
            }

            // Read file content
            const fileData = await ipcRenderer.invoke('read-file', filePath);
            if (!fileData.success) {
                throw new Error(fileData.error);
            }

            this.currentFile = {
                path: filePath,
                info: fileInfo.info,
                data: fileData.data
            };

            // Parse file based on extension
            await this.parseFile();
            
            // Update UI
            this.updateFileInfo();
            this.hideWelcomeScreen();
            this.updateStatus('File loaded successfully');

            // Auto-enable tracks for the loaded file type
            this.autoEnableTracksForFileType(this.currentFile.info.extension);

        } catch (error) {
            console.error('Error loading file:', error);
            this.updateStatus(`Error: ${error.message}`);
            alert(`Failed to load file: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    async parseFile() {
        const extension = this.currentFile.info.extension.toLowerCase();
        
        switch (extension) {
            case '.fasta':
            case '.fa':
                await this.parseFasta();
                break;
            case '.gb':
            case '.gbk':
            case '.genbank':
                await this.parseGenBank();
                break;
            case '.gff':
            case '.gtf':
                await this.parseGFF();
                break;
            case '.bed':
                await this.parseBED();
                break;
            case '.vcf':
                await this.parseVCF();
                break;
            case '.sam':
                await this.parseSAM();
                break;
            default:
                // Try to parse as FASTA by default
                await this.parseFasta();
        }
    }

    async parseGenBank() {
        const lines = this.currentFile.data.split('\n');
        const sequences = {};
        const annotations = {};
        let currentSeq = null;
        let currentData = '';
        let inOrigin = false;
        let features = [];
        let currentFeature = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Parse LOCUS line for sequence name
            if (line.startsWith('LOCUS')) {
                const parts = line.split(/\s+/);
                currentSeq = parts[1];
                sequences[currentSeq] = '';
                annotations[currentSeq] = [];
                features = [];
            }

            // Parse FEATURES section
            if (line.startsWith('FEATURES')) {
                continue;
            }

            // Parse individual features
            if (line.startsWith('     ') && !inOrigin && currentSeq) {
                const featureMatch = line.match(/^\s+(\w+)\s+(.+)/);
                if (featureMatch) {
                    const [, type, location] = featureMatch;
                    currentFeature = {
                        type: type,
                        location: location,
                        qualifiers: {},
                        start: null,
                        end: null,
                        strand: 1
                    };
                    
                    // Parse location
                    this.parseGenBankLocation(currentFeature, location);
                    features.push(currentFeature);
                }
            }

            // Parse qualifiers
            if (line.startsWith('                     /') && currentFeature) {
                const qualMatch = line.match(/^\s+\/(\w+)=?"?([^"]*)"?/);
                if (qualMatch) {
                    const [, key, value] = qualMatch;
                    currentFeature.qualifiers[key] = value.replace(/"/g, '');
                }
            }

            // Parse ORIGIN section
            if (line.startsWith('ORIGIN')) {
                inOrigin = true;
                annotations[currentSeq] = features;
                continue;
            }

            // Parse sequence data
            if (inOrigin && trimmed && !line.startsWith('//')) {
                const seqData = line.replace(/\d+/g, '').replace(/\s+/g, '').toUpperCase();
                currentData += seqData;
            }

            // End of record
            if (line.startsWith('//')) {
                if (currentSeq && currentData) {
                    sequences[currentSeq] = currentData;
                }
                inOrigin = false;
                currentData = '';
            }
        }

        this.currentSequence = sequences;
        this.currentAnnotations = annotations;
        this.populateChromosomeSelect();
        
        // Select first chromosome by default
        const firstChr = Object.keys(sequences)[0];
        if (firstChr) {
            this.selectChromosome(firstChr);
        }
    }

    parseGenBankLocation(feature, location) {
        // Simple location parsing - handles basic cases like "123..456" and "complement(123..456)"
        let isComplement = false;
        let cleanLocation = location;

        if (location.includes('complement')) {
            isComplement = true;
            feature.strand = -1;
            cleanLocation = location.replace(/complement\(|\)/g, '');
        }

        const rangeMatch = cleanLocation.match(/(\d+)\.\.(\d+)/);
        if (rangeMatch) {
            feature.start = parseInt(rangeMatch[1]);
            feature.end = parseInt(rangeMatch[2]);
        } else {
            const singleMatch = cleanLocation.match(/(\d+)/);
            if (singleMatch) {
                feature.start = parseInt(singleMatch[1]);
                feature.end = feature.start;
            }
        }
    }

    async parseFasta() {
        const lines = this.currentFile.data.split('\n');
        const sequences = {};
        let currentSeq = null;
        let currentData = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('>')) {
                // Save previous sequence
                if (currentSeq) {
                    sequences[currentSeq] = currentData;
                }
                // Start new sequence
                currentSeq = trimmed.substring(1).split(' ')[0];
                currentData = '';
            } else if (trimmed && currentSeq) {
                currentData += trimmed.toUpperCase();
            }
        }

        // Save last sequence
        if (currentSeq) {
            sequences[currentSeq] = currentData;
        }

        this.currentSequence = sequences;
        this.populateChromosomeSelect();
        
        // Select first chromosome by default
        const firstChr = Object.keys(sequences)[0];
        if (firstChr) {
            this.selectChromosome(firstChr);
        }
    }

    populateChromosomeSelect() {
        const select = document.getElementById('chromosomeSelect');
        select.innerHTML = '<option value="">Select chromosome...</option>';
        
        if (this.currentSequence) {
            Object.keys(this.currentSequence).forEach(chr => {
                const option = document.createElement('option');
                option.value = chr;
                option.textContent = chr;
                select.appendChild(option);
            });
        }
    }

    selectChromosome(chromosome) {
        if (!chromosome || !this.currentSequence[chromosome]) return;

        const sequence = this.currentSequence[chromosome];
        this.currentPosition = { start: 0, end: Math.min(10000, sequence.length) };
        
        // Update chromosome select
        document.getElementById('chromosomeSelect').value = chromosome;
        
        // Update statistics
        this.updateStatistics(chromosome, sequence);
        
        // Show sequence and annotations
        this.displayGenomeView(chromosome, sequence);
    }

    updateStatistics(chromosome, sequence) {
        const length = sequence.length;
        const gcCount = (sequence.match(/[GC]/g) || []).length;
        const gcContent = ((gcCount / length) * 100).toFixed(2);

        document.getElementById('sequenceLength').textContent = length.toLocaleString();
        document.getElementById('gcContent').textContent = `${gcContent}%`;
        document.getElementById('currentPosition').textContent = 
            `${this.currentPosition.start + 1}-${this.currentPosition.end}`;
    }

    displayGenomeView(chromosome, sequence) {
        const container = document.getElementById('genomeViewer');
        
        const preservedHeights = new Map();
        const trackTypeMapping = {
            'gene': 'genes',
            'gc': 'gc',
            'variant': 'variants',
            'reads': 'reads',
            'protein': 'proteins',
            'wig': 'wigTracks'  // Add WIG tracks to preservation mapping
        };

        const existingTracks = container.querySelectorAll('[class*="-track"]');
        console.log('[displayGenomeView] Existing tracks found for height preservation:', existingTracks.length);
        existingTracks.forEach(track => {
            const trackContent = track.querySelector('.track-content');
            if (trackContent && trackContent.style.height && trackContent.style.height !== '') {
                let baseType = null;
                for (const cls of track.classList) {
                    if (cls.endsWith('-track') && !cls.startsWith('track-splitter')) { // Ensure it's a main track div
                        baseType = cls.replace('-track', '');
                        break;
                    }
                }
                if (baseType) {
                    const mappedType = trackTypeMapping[baseType];
                    if (mappedType) {
                        preservedHeights.set(mappedType, trackContent.style.height);
                        console.log(`[displayGenomeView] Preserving height for ${mappedType} (from class ${baseType}-track): ${trackContent.style.height}`);
                    } else {
                        console.warn(`[displayGenomeView] No mapping found for base track type: ${baseType} from classList:`, track.classList);
                    }
                } else {
                    // console.log('[displayGenomeView] Could not determine baseType for track:', track.className);
                }
            } else if (trackContent) {
                // console.log('[displayGenomeView] No style.height to preserve for track (or height is empty string):', track.className, 'Height:', trackContent.style.height);
            }
        });
        console.log('[displayGenomeView] Preserved heights map:', preservedHeights);
        
        container.innerHTML = '';
        
        // Show navigation controls
        document.getElementById('genomeNavigation').style.display = 'block';
        
        // Create Genome AI Studio container
        const browserContainer = document.createElement('div');
        browserContainer.className = 'genome-browser-container';
        
        // Create ruler (always show)
        const ruler = this.createRuler();
        browserContainer.appendChild(ruler);
        
        // Collect all tracks to be displayed
        const tracksToShow = [];
        
        // 1. Gene track (only if genes track is selected and annotations exist)
        if (this.visibleTracks.has('genes') && this.currentAnnotations && this.currentAnnotations[chromosome]) {
            const geneTrack = this.createGeneTrack(chromosome);
            tracksToShow.push({ element: geneTrack, type: 'genes' });
        }
        
        // 2. GC Content track (only if GC track is selected)
        if (this.visibleTracks.has('gc')) {
            const gcTrack = this.createGCTrack(chromosome, sequence);
            tracksToShow.push({ element: gcTrack, type: 'gc' });
        }
        
        // 3. Variants track (show if selected, even without data)
        if (this.visibleTracks.has('variants')) {
            const variantTrack = this.createVariantTrack(chromosome);
            tracksToShow.push({ element: variantTrack, type: 'variants' });
        }
        
        // 4. Aligned reads track (show if selected, even without data)
        if (this.visibleTracks.has('reads')) {
            const readsTrack = this.createReadsTrack(chromosome);
            tracksToShow.push({ element: readsTrack, type: 'reads' });
        }
        
        // 5. Protein track (only if proteins track is selected and we have CDS annotations)
        if (this.visibleTracks.has('proteins') && this.currentAnnotations && this.currentAnnotations[chromosome]) {
            const proteinTrack = this.createProteinTrack(chromosome);
            tracksToShow.push({ element: proteinTrack, type: 'proteins' });
        }
        
        // Add tracks without splitters, but make them draggable and resizable
        tracksToShow.forEach((track, index) => {
            // Add the track
            browserContainer.appendChild(track.element);
            
            // RESTORE PRESERVED HEIGHT if it exists
            const trackContent = track.element.querySelector('.track-content');
            const typeToRestore = track.type;
            if (trackContent && preservedHeights.has(typeToRestore)) {
                const heightToRestore = preservedHeights.get(typeToRestore);
                trackContent.style.height = heightToRestore;
                console.log(`[displayGenomeView] Restored height for ${typeToRestore}: ${heightToRestore}`);
            } else if (trackContent) {
                 console.log(`[displayGenomeView] No preserved height found for ${typeToRestore}. Current height: ${trackContent.style.height}`);
            }
            
            // Make tracks draggable for reordering and add resize handle
            this.makeTrackDraggable(track.element, track.type);
            this.addTrackResizeHandle(track.element, track.type);
        });
        
        container.appendChild(browserContainer);
        
        // Manage panel flex properties and visibility
        const genomeViewerSection = document.getElementById('genomeViewerSection');
        const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
        const splitter = document.getElementById('splitter'); // Main vertical splitter

        if (!genomeViewerSection.dataset.originalFlexBasis) { // Ensure originalFlexBasis is cached
            genomeViewerSection.dataset.originalFlexBasis = getComputedStyle(genomeViewerSection).flexBasis || '50%';
        }

        // Check if welcome screen is visible - improved detection
        const welcomeScreen = document.querySelector('.welcome-screen');
        const welcomeVisible = welcomeScreen && (
            welcomeScreen.style.display === '' || 
            welcomeScreen.style.display === 'flex' || 
            welcomeScreen.style.display === 'block' ||
            (welcomeScreen.style.display !== 'none' && getComputedStyle(welcomeScreen).display !== 'none')
        );

        if (welcomeVisible) { // Welcome screen takes precedence
            if (genomeViewerSection) {
                genomeViewerSection.style.flexGrow = '1';
                genomeViewerSection.style.flexBasis = '100%';
            }
            if (sequenceDisplaySection) sequenceDisplaySection.style.display = 'none';
            if (splitter) splitter.style.display = 'none';
            if (document.getElementById('sequenceDisplay')) document.getElementById('sequenceDisplay').style.display = 'none';
        } else if (this.showBottomSequence) {
            if (genomeViewerSection) {
                genomeViewerSection.style.flexGrow = '0';
                // Use current height if set by splitter, otherwise original flex-basis
                genomeViewerSection.style.flexBasis = genomeViewerSection.style.height && genomeViewerSection.style.height !== 'auto' ? genomeViewerSection.style.height : genomeViewerSection.dataset.originalFlexBasis;
            }
            if (sequenceDisplaySection) sequenceDisplaySection.style.display = 'flex';
            if (splitter) splitter.style.display = 'flex';
            this.displayEnhancedSequence(chromosome, sequence);
        } else { // Bottom sequence is hidden, and welcome screen is also hidden
            if (genomeViewerSection) {
                genomeViewerSection.style.flexGrow = '1';
                genomeViewerSection.style.flexBasis = '100%';
            }
            if (sequenceDisplaySection) sequenceDisplaySection.style.display = 'none';
            if (splitter) splitter.style.display = 'none';
            if (document.getElementById('sequenceDisplay')) document.getElementById('sequenceDisplay').style.display = 'none';
        }
    }

    createRuler() {
        const ruler = document.createElement('div');
        ruler.className = 'genome-ruler';
        
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const range = end - start;
        const tickInterval = Math.max(1, Math.floor(range / 10));
        
        for (let pos = start; pos <= end; pos += tickInterval) {
            const tick = document.createElement('div');
            tick.className = 'ruler-tick';
            tick.style.left = `${((pos - start) / range) * 100}%`;
            tick.textContent = pos.toLocaleString();
            ruler.appendChild(tick);
        }
        
        return ruler;
    }

    createGeneTrack(chromosome) {
        const track = document.createElement('div');
        track.className = 'gene-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'Genes & Features';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content';
        
        this.makeDraggable(trackContent, chromosome);
        
        const annotations = this.currentAnnotations[chromosome] || [];
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const range = end - start;
        
        // Detect operons using the methods available in GenomeBrowser class
        const operons = this.detectOperons ? this.detectOperons(annotations) : [];
        const operonColors = this.getOperonColors ? this.getOperonColors() : this.getDefaultOperonColors();

        const visibleGenes = annotations.filter(feature => {
            const validTypes = ['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'misc_feature',
                              'regulatory', 'promoter', 'terminator', 'repeat_region'];
            return (validTypes.includes(feature.type) || feature.type.includes('RNA')) &&
                   this.shouldShowGeneType(feature.type);
        }).filter(gene => 
            gene.start && gene.end && 
            gene.start <= end && gene.end >= start
        );
        
        if (visibleGenes.length === 0) {
            const noGenesMsg = document.createElement('div');
            noGenesMsg.className = 'no-genes-message';
            noGenesMsg.textContent = 'No genes/features in this region or all filtered out';
            noGenesMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noGenesMsg);
            trackContent.style.height = '80px';
            track.appendChild(trackContent);
            return track;
        }

        const geneRows = this.arrangeGenesInRows(visibleGenes, start, end);
        const geneHeight = 23;
        const rowSpacing = 6;
        const topPadding = 10;
        const bottomPadding = 10; // Adjusted for stats element space
        const trackHeight = topPadding + (geneRows.length * (geneHeight + rowSpacing)) - (geneRows.length > 0 ? rowSpacing : 0) + bottomPadding;
        trackContent.style.height = `${Math.max(trackHeight, 80)}px`;

        geneRows.forEach((rowGenes, rowIndex) => {
            rowGenes.forEach((gene) => {
                const geneElement = document.createElement('div');
                let geneType = gene.type.toLowerCase();
                if (geneType.includes('rna') && !['mrna', 'trna', 'rrna'].includes(geneType)) {
                    geneType = 'misc_feature';
                }
                geneElement.className = `gene-element ${geneType}`;
                
                const geneStartPos = Math.max(gene.start, start);
                const geneEndPos = Math.min(gene.end, end);
                const left = ((geneStartPos - start) / range) * 100;
                const width = ((geneEndPos - geneStartPos) / range) * 100;
                
                geneElement.style.left = `${left}%`;
                geneElement.style.width = `${Math.max(width, 0.3)}%`;
                if (width < 0.5) geneElement.style.minWidth = '8px';

                // Apply consistent coloring
                const operonInfo = operons && gene.type !== 'promoter' && gene.type !== 'terminator' ? this.getGeneOperonInfo(gene, operons, operonColors) : null;
                const bgColor = operonInfo ? operonInfo.color : this.getFeatureTypeColor(gene.type);
                const borderColor = operonInfo ? operonInfo.color : this.getFeatureTypeColor(gene.type, true); // Get a darker shade for border
                
                geneElement.style.background = bgColor;
                geneElement.style.borderColor = borderColor;
                geneElement.style.color = this.getContrastingTextColor(bgColor);

                geneElement.style.top = `${topPadding + rowIndex * (geneHeight + rowSpacing)}px`;
                
                if (gene.strand === -1) {
                    geneElement.classList.add('reverse-strand');
                }
                
                // Add user-defined feature styling
                if (gene.userDefined) {
                    geneElement.classList.add('user-defined-feature');
                }
                
                const geneNameDisplay = gene.qualifiers.gene || gene.qualifiers.locus_tag || gene.qualifiers.product || gene.type;
                const geneInfo = `${geneNameDisplay} (${gene.type})`;
                const positionInfo = `${gene.start}-${gene.end} (${gene.strand === -1 ? '-' : '+'} strand)`;
                const rowInfo = operonInfo ? `\\nOperon: ${operonInfo.name}` : ''
                geneElement.title = `${geneInfo}\\nPosition: ${positionInfo}${rowInfo}\\nRow: ${rowIndex + 1}`;
                
                if (width > 2) {
                    geneElement.textContent = geneNameDisplay.length > 12 ? geneNameDisplay.substring(0, 12) + '...' : geneNameDisplay;
                } else if (width > 0.8) {
                    geneElement.textContent = geneNameDisplay.substring(0, 3);
                } else {
                    geneElement.textContent = '';
                }
                
                geneElement.addEventListener('click', () => {
                    this.showGeneDetails(gene, operonInfo);
                });
                
                // Check if this gene should be selected (maintain selection state)
                if (this.selectedGene && this.selectedGene.gene && 
                    this.selectedGene.gene.start === gene.start && 
                    this.selectedGene.gene.end === gene.end &&
                    this.selectedGene.gene.type === gene.type) {
                    geneElement.classList.add('selected');
                }
                
                trackContent.appendChild(geneElement);
            });
        });
        
        const statsElement = document.createElement('div');
        statsElement.className = 'gene-stats';
        statsElement.textContent = `${visibleGenes.length} features in ${geneRows.length} rows`;
        // Style for bottom-left positioning
        statsElement.style.position = 'absolute';
        statsElement.style.bottom = '5px';
        statsElement.style.left = '10px'; // Aligns with track content padding
        statsElement.style.fontSize = '11px';
        statsElement.style.color = '#555555'; // Dark grey for better visibility
        statsElement.style.backgroundColor = 'rgba(250, 250, 250, 0.75)'; // Semi-transparent background
        statsElement.style.padding = '2px 5px';
        statsElement.style.borderRadius = '3px';
        statsElement.style.zIndex = '5'; // Ensure it's above gene elements
        
        trackContent.appendChild(statsElement);
        
        track.appendChild(trackContent);
        return track;
    }

    showGeneDetails(gene, operonInfo = null) {
        // Set the selected gene and update visual state
        this.selectGene(gene, operonInfo);
        
        // Show the gene details sidebar if it's hidden
        this.showGeneDetailsPanel();
        
        // Populate the gene details panel
        this.populateGeneDetails(gene, operonInfo);
        
        // Highlight the gene sequence in the sequence track
        this.highlightGeneSequence(gene);
    }

    selectGene(gene, operonInfo = null) {
        // Clear all existing selections (gene and manual sequence selections)
        this.clearAllSelections();
        
        // Set new selected gene
        this.selectedGene = { gene, operonInfo };
        
        // Add selection styling to the clicked gene element
        const geneElements = document.querySelectorAll('.gene-element');
        geneElements.forEach(el => {
            // Check if this element represents the selected gene by comparing positions
            const elementTitle = el.title || '';
            const genePosition = `${gene.start}-${gene.end}`;
            if (elementTitle.includes(genePosition)) {
                el.classList.add('selected');
            }
        });
        
        console.log('Selected gene:', gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type);
    }

    showGeneDetailsPanel() {
        const geneDetailsSection = document.getElementById('geneDetailsSection');
        if (geneDetailsSection) {
            geneDetailsSection.style.display = 'block';
            this.showSidebarIfHidden();
        }
    }

    populateGeneDetails(gene, operonInfo = null) {
        const geneDetailsContent = document.getElementById('geneDetailsContent');
        if (!geneDetailsContent) return;
        
        // Get basic gene information
        const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.qualifiers?.product || 'Unknown Gene';
        const geneType = gene.type;
        const position = `${gene.start.toLocaleString()}-${gene.end.toLocaleString()}`;
        const length = (gene.end - gene.start + 1).toLocaleString();
        const strand = gene.strand === -1 ? 'Reverse (-)' : 'Forward (+)';
        
        // Get current chromosome and sequence for sequence extraction
        const currentChr = document.getElementById('chromosomeSelect').value;
        const fullSequence = this.currentSequence ? this.currentSequence[currentChr] : null;
        
        // Create the gene details HTML
        let html = `
            <div class="gene-details-info">
                <div class="gene-basic-info">
                    <div class="gene-name">${geneName}</div>
                    <div class="gene-type-badge">${geneType}</div>
                    <div class="gene-position">Position: ${position}</div>
                    <div class="gene-strand">Strand: ${strand} | Length: ${length} bp</div>
                </div>
        `;
        
        // Add operon information if available
        if (operonInfo) {
            html += `
                <div class="gene-operon-info">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div style="width: 16px; height: 16px; background: ${operonInfo.color}; border-radius: 3px; border: 2px solid rgba(0,0,0,0.3);"></div>
                        <span style="font-weight: 600;">Operon: ${operonInfo.name}</span>
                    </div>
                </div>
            `;
        }
        
        // Add sequences section if we have sequence data
        if (fullSequence) {
            html += this.createSequencesSection(gene, fullSequence, geneName, currentChr);
        }
        
        // Add gene attributes if available
        if (gene.qualifiers && Object.keys(gene.qualifiers).length > 0) {
            html += `
                <div class="gene-attributes">
                    <h4>Attributes</h4>
            `;
            
            Object.entries(gene.qualifiers).forEach(([key, value]) => {
                // Convert value to string and check if it's meaningful
                const stringValue = value != null ? String(value) : '';
                if (stringValue && stringValue !== 'Unknown' && stringValue.trim() !== '') {
                    html += `
                        <div class="gene-attribute">
                            <div class="gene-attribute-label">${key.replace(/_/g, ' ')}</div>
                            <div class="gene-attribute-value">${stringValue}</div>
                        </div>
                    `;
                }
            });
            
            html += `</div>`;
        }
        
        // Add action buttons
        html += `
            <div class="gene-actions">
                <button class="btn gene-zoom-btn gene-action-btn" onclick="window.genomeBrowser.zoomToGene()">
                    <i class="fas fa-search-plus"></i> Zoom to Gene
                </button>
                <button class="btn gene-copy-btn gene-action-btn" onclick="window.genomeBrowser.copyGeneSequence()">
                    <i class="fas fa-copy"></i> Copy DNA Sequence
                </button>
        `;
        
        // Add copy translation button if it's a CDS or has translation
        if (geneType === 'CDS' || (gene.qualifiers && gene.qualifiers.translation)) {
            html += `
                <button class="btn gene-copy-translation-btn gene-action-btn" onclick="window.genomeBrowser.copyGeneTranslation()">
                    <i class="fas fa-copy"></i> Copy Translation
                </button>
            `;
        }
        
        html += `</div></div>`;
        
        geneDetailsContent.innerHTML = html;
        
        // Add event listeners for expandable sections
        this.setupExpandableSequences();
    }
    
    /**
     * Create sequences section with CDS and translation
     */
    createSequencesSection(gene, fullSequence, geneName, chromosome) {
        let html = `<div class="gene-sequences">`;
        
        // Get DNA sequence
        const dnaSequence = fullSequence.substring(gene.start - 1, gene.end);
        const dnaLength = dnaSequence.length;
        
        // DNA Sequence section
        html += `
            <div class="sequence-section">
                <h4><i class="fas fa-dna"></i> DNA Sequence (${dnaLength} bp)</h4>
                <div class="sequence-content">
                    <div class="sequence-display" data-sequence-type="dna">
                        <div class="sequence-preview">${this.formatSequencePreview(dnaSequence, 60)}</div>
                        <div class="sequence-full" style="display: none;">
                            <div class="sequence-formatted">${this.formatSequenceWithLineNumbers(dnaSequence, gene.start)}</div>
                        </div>
                    </div>
                    <div class="sequence-actions">
                        <button class="btn btn-sm toggle-sequence-btn" data-target="dna">
                            <i class="fas fa-expand"></i> Show Full Sequence
                        </button>
                        <button class="btn btn-sm copy-sequence-btn" data-sequence-type="dna" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // CDS and Translation sections if applicable
        if (gene.type === 'CDS' || (gene.qualifiers && gene.qualifiers.translation)) {
            // For CDS features, the DNA sequence is the CDS
            const cdsSequence = dnaSequence;
            const translation = gene.qualifiers?.translation || this.translateDNA(cdsSequence, gene.strand);
            
            // CDS Sequence section
            html += `
                <div class="sequence-section">
                    <h4><i class="fas fa-code"></i> CDS Sequence (${cdsSequence.length} bp)</h4>
                    <div class="sequence-content">
                        <div class="sequence-display" data-sequence-type="cds">
                            <div class="sequence-preview">${this.formatSequencePreview(cdsSequence, 60)}</div>
                            <div class="sequence-full" style="display: none;">
                                <div class="sequence-formatted">${this.formatSequenceWithLineNumbers(cdsSequence, gene.start)}</div>
                            </div>
                        </div>
                        <div class="sequence-actions">
                            <button class="btn btn-sm toggle-sequence-btn" data-target="cds">
                                <i class="fas fa-expand"></i> Show Full Sequence
                            </button>
                            <button class="btn btn-sm copy-sequence-btn" data-sequence-type="cds" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Translation section
            const translationLength = translation.replace(/\*/g, '').length; // Remove stop codons for length count
            html += `
                <div class="sequence-section">
                    <h4><i class="fas fa-atom"></i> Protein Translation (${translationLength} aa)</h4>
                    <div class="sequence-content">
                        <div class="sequence-display" data-sequence-type="translation">
                            <div class="sequence-preview">${this.formatProteinPreview(translation, 40)}</div>
                            <div class="sequence-full" style="display: none;">
                                <div class="sequence-formatted">${this.formatProteinWithLineNumbers(translation)}</div>
                            </div>
                        </div>
                        <div class="sequence-actions">
                            <button class="btn btn-sm toggle-sequence-btn" data-target="translation">
                                <i class="fas fa-expand"></i> Show Full Sequence
                            </button>
                            <button class="btn btn-sm copy-sequence-btn" data-sequence-type="translation" data-gene-name="${geneName}" data-chr="${chromosome}" data-start="${gene.start}" data-end="${gene.end}" data-strand="${gene.strand}">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        return html;
    }
    
    /**
     * Format sequence preview (first N characters with ellipsis)
     */
    formatSequencePreview(sequence, maxLength = 60) {
        if (sequence.length <= maxLength) {
            return `<span class="sequence-text">${sequence}</span>`;
        }
        return `<span class="sequence-text">${sequence.substring(0, maxLength)}<span class="sequence-ellipsis">...</span></span>`;
    }
    
    /**
     * Format protein preview with colored amino acids
     */
    formatProteinPreview(sequence, maxLength = 40) {
        const preview = sequence.length <= maxLength ? sequence : sequence.substring(0, maxLength);
        const colored = this.colorizeProteinSequence(preview);
        if (sequence.length > maxLength) {
            return `${colored}<span class="sequence-ellipsis">...</span>`;
        }
        return colored;
    }
    
    /**
     * Format sequence with line numbers
     */
    formatSequenceWithLineNumbers(sequence, startPosition = 1) {
        const lineLength = 60;
        let html = '';
        
        for (let i = 0; i < sequence.length; i += lineLength) {
            const lineSeq = sequence.substring(i, i + lineLength);
            const lineStart = startPosition + i;
            html += `
                <div class="sequence-line">
                    <span class="sequence-position">${lineStart.toLocaleString()}</span>
                    <span class="sequence-bases">${this.colorizeSequenceBases(lineSeq)}</span>
                </div>
            `;
        }
        return html;
    }
    
    /**
     * Format protein with line numbers
     */
    formatProteinWithLineNumbers(sequence) {
        const lineLength = 60;
        let html = '';
        
        for (let i = 0; i < sequence.length; i += lineLength) {
            const lineSeq = sequence.substring(i, i + lineLength);
            const lineStart = i + 1;
            html += `
                <div class="sequence-line">
                    <span class="sequence-position">${lineStart}</span>
                    <span class="sequence-bases">${this.colorizeProteinSequence(lineSeq)}</span>
                </div>
            `;
        }
        return html;
    }
    
    /**
     * Colorize DNA sequence bases
     */
    colorizeSequenceBases(sequence) {
        return sequence.split('').map(base => {
            const lowerBase = base.toLowerCase();
            return `<span class="base-${lowerBase}">${base}</span>`;
        }).join('');
    }
    
    /**
     * Setup expandable sequence functionality
     */
    setupExpandableSequences() {
        // Toggle sequence display
        document.querySelectorAll('.toggle-sequence-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.toggle-sequence-btn').dataset.target;
                const sequenceDisplay = document.querySelector(`[data-sequence-type="${target}"]`);
                const preview = sequenceDisplay.querySelector('.sequence-preview');
                const full = sequenceDisplay.querySelector('.sequence-full');
                const icon = e.target.closest('.toggle-sequence-btn').querySelector('i');
                const text = e.target.closest('.toggle-sequence-btn');
                
                if (full.style.display === 'none') {
                    preview.style.display = 'none';
                    full.style.display = 'block';
                    icon.className = 'fas fa-compress';
                    text.innerHTML = '<i class="fas fa-compress"></i> Show Preview';
                } else {
                    preview.style.display = 'block';
                    full.style.display = 'none';
                    icon.className = 'fas fa-expand';
                    text.innerHTML = '<i class="fas fa-expand"></i> Show Full Sequence';
                }
            });
        });
        
        // Copy individual sequences
        document.querySelectorAll('.copy-sequence-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target.closest('.copy-sequence-btn');
                const type = button.dataset.sequenceType;
                const geneName = button.dataset.geneName;
                const chr = button.dataset.chr;
                const start = button.dataset.start;
                const end = button.dataset.end;
                const strand = button.dataset.strand;
                
                this.copySpecificSequence(type, geneName, chr, start, end, strand);
            });
        });
    }
    
    /**
     * Copy specific sequence type
     */
    copySpecificSequence(type, geneName, chromosome, start, end, strand) {
        if (!this.currentSequence || !this.currentSequence[chromosome]) {
            alert('No sequence available to copy');
            return;
        }
        
        const fullSequence = this.currentSequence[chromosome];
        let sequence, header, description;
        
        switch (type) {
            case 'dna':
            case 'cds':
                sequence = fullSequence.substring(start - 1, end);
                if (strand === '-1') {
                    sequence = this.getReverseComplement(sequence);
                }
                header = `>${geneName}_${type.toUpperCase()} ${chromosome}:${start}-${end} (${strand === '-1' ? '-' : '+'} strand)`;
                description = `${type.toUpperCase()} sequence`;
                break;
                
            case 'translation':
                const dnaSeq = fullSequence.substring(start - 1, end);
                sequence = this.translateDNA(dnaSeq, parseInt(strand));
                header = `>${geneName}_TRANSLATION ${chromosome}:${start}-${end} (${strand === '-1' ? '-' : '+'} strand)`;
                description = 'protein translation';
                break;
                
            default:
                alert('Unknown sequence type');
                return;
        }
        
        const fastaContent = `${header}\n${sequence}`;
        
        navigator.clipboard.writeText(fastaContent).then(() => {
            alert(`Copied ${geneName} ${description} (${sequence.length} ${type === 'translation' ? 'aa' : 'bp'}) to clipboard`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        });
    }
    
    /**
     * Copy gene translation (main button functionality)
     */
    copyGeneTranslation() {
        if (!this.selectedGene) return;
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('No sequence available to copy');
            return;
        }
        
        const gene = this.selectedGene.gene;
        let translation;
        
        // Use existing translation if available, otherwise translate the DNA
        if (gene.qualifiers && gene.qualifiers.translation) {
            translation = gene.qualifiers.translation;
        } else {
            const sequence = this.currentSequence[currentChr];
            const geneSequence = sequence.substring(gene.start - 1, gene.end);
            translation = this.translateDNA(geneSequence, gene.strand);
        }
        
        const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
        const fastaHeader = `>${geneName}_TRANSLATION ${currentChr}:${gene.start}-${gene.end} (${gene.strand === -1 ? '-' : '+'} strand)`;
        const fastaContent = `${fastaHeader}\n${translation}`;
        
        navigator.clipboard.writeText(fastaContent).then(() => {
            alert(`Copied ${geneName} translation (${translation.replace(/\*/g, '').length} aa) to clipboard`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        });
    }

    highlightGeneSequence(gene) {
        // Clear any existing manual sequence selections
        this.clearSequenceSelection();
        
        // Clear any existing highlights
        this.clearSequenceHighlights();
        
        // Only highlight if the gene is within the current view
        const currentStart = this.currentPosition.start;
        const currentEnd = this.currentPosition.end;
        
        if (gene.end < currentStart || gene.start > currentEnd) {
            console.log('Gene is outside current view, skipping sequence highlight');
            return;
        }
        
        // Find sequence bases within the gene range
        const sequenceBases = document.querySelectorAll('.sequence-bases span');
        sequenceBases.forEach(baseElement => {
            const parentLine = baseElement.closest('.sequence-line');
            if (!parentLine) return;
            
            const positionElement = parentLine.querySelector('.sequence-position');
            if (!positionElement) return;
            
            const lineStartPos = parseInt(positionElement.textContent.replace(/,/g, '')) - 1; // Convert to 0-based
            const baseIndex = Array.from(parentLine.querySelectorAll('.sequence-bases span')).indexOf(baseElement);
            const absolutePos = lineStartPos + baseIndex + 1; // Convert back to 1-based for comparison
            
            // Check if this base is within the gene range
            if (absolutePos >= gene.start && absolutePos <= gene.end) {
                baseElement.classList.add('sequence-highlight');
            }
        });
        
        console.log(`Highlighted sequence for gene ${gene.qualifiers?.gene || gene.type} (${gene.start}-${gene.end})`);
    }

    clearSequenceHighlights() {
        const highlightedBases = document.querySelectorAll('.sequence-highlight');
        highlightedBases.forEach(el => el.classList.remove('sequence-highlight'));
    }

    // Action methods for gene details buttons
    zoomToGene() {
        if (!this.selectedGene) return;
        
        const gene = this.selectedGene.gene;
        const geneLength = gene.end - gene.start;
        const padding = Math.max(500, Math.floor(geneLength * 0.2)); // 20% padding or 500bp minimum
        
        const newStart = Math.max(0, gene.start - padding);
        const newEnd = gene.end + padding;
        
        this.currentPosition = { start: newStart, end: newEnd };
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.updateStatistics(currentChr, this.currentSequence[currentChr]);
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    copyGeneSequence() {
        if (!this.selectedGene) return;
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('No sequence available to copy');
            return;
        }
        
        const gene = this.selectedGene.gene;
        const sequence = this.currentSequence[currentChr];
        const geneSequence = sequence.substring(gene.start - 1, gene.end); // Convert to 0-based indexing
        
        const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
        const fastaHeader = `>${geneName} ${currentChr}:${gene.start}-${gene.end} (${gene.strand === -1 ? '-' : '+'} strand)`;
        const fastaContent = `${fastaHeader}\n${geneSequence}`;
        
        navigator.clipboard.writeText(fastaContent).then(() => {
            alert(`Copied ${geneName} sequence (${geneSequence.length} bp) to clipboard`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        });
    }

    createSequenceTrack(chromosome, sequence) {
        const track = document.createElement('div');
        track.className = 'sequence-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'Sequence';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content sequence-visualization';
        
        // Add draggable functionality
        this.makeDraggable(trackContent, chromosome);
        
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const subsequence = sequence.substring(start, end);
        const range = end - start;
        
        // Create single-line sequence display with dynamic sizing
        const seqDisplay = document.createElement('div');
        seqDisplay.className = 'sequence-single-line';
        seqDisplay.style.position = 'relative';
        seqDisplay.style.height = '30px';
        seqDisplay.style.overflow = 'hidden';
        seqDisplay.style.display = 'flex';
        seqDisplay.style.alignItems = 'center';
        
        // Calculate font size based on available space and sequence length
        const containerWidth = trackContent.offsetWidth || 800; // fallback width
        const maxFontSize = 16;
        const minFontSize = 4;
        const calculatedFontSize = Math.max(minFontSize, Math.min(maxFontSize, containerWidth / range * 0.8));
        
        // Create sequence bases with dynamic positioning
        for (let i = 0; i < subsequence.length; i++) {
            const base = subsequence[i];
            const baseElement = document.createElement('span');
            baseElement.className = `base-${base.toLowerCase()} sequence-base-inline`;
            baseElement.textContent = base;
            baseElement.style.position = 'absolute';
            baseElement.style.left = `${(i / range) * 100}%`;
            baseElement.style.fontSize = `${calculatedFontSize}px`;
            baseElement.style.fontFamily = 'monospace';
            baseElement.style.fontWeight = 'bold';
            baseElement.style.textAlign = 'center';
            baseElement.style.lineHeight = '30px';
            
            // Add tooltip with position info
            const position = start + i + 1;
            baseElement.title = `Position: ${position}, Base: ${base}`;
            
            seqDisplay.appendChild(baseElement);
        }
        
        trackContent.appendChild(seqDisplay);
        track.appendChild(trackContent);
        return track;
    }

    createGCTrack(chromosome, sequence) {
        const track = document.createElement('div');
        track.className = 'gc-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'GC Content';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content';
        trackContent.style.height = '80px';
        
        // Add draggable functionality
        this.makeDraggable(trackContent, chromosome);
        
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const subsequence = sequence.substring(start, end);
        
        // Create GC content visualization
        const gcDisplay = this.createGCContentVisualization(subsequence);
        trackContent.appendChild(gcDisplay);
        
        track.appendChild(trackContent);
        return track;
    }

    createReadsTrack(chromosome) {
        const track = document.createElement('div');
        track.className = 'reads-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'Aligned Reads';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content';
        trackContent.style.height = '120px';
        
        // Add draggable functionality
        this.makeDraggable(trackContent, chromosome);
        
        const reads = this.currentReads[chromosome] || [];
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const range = end - start;
        
        // Check if we have any reads data at all
        if (!this.currentReads || Object.keys(this.currentReads).length === 0) {
            const noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-reads-message';
            noDataMsg.textContent = 'No SAM/BAM file loaded. Load a SAM/BAM file to see aligned reads.';
            noDataMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noDataMsg);
            track.appendChild(trackContent);
            return track;
        }
        
        // Filter reads that overlap with current region
        const visibleReads = reads.filter(read => 
            read.start && read.end && 
            read.start <= end && read.end >= start
        );
        
        console.log(`Displaying ${visibleReads.length} reads in region ${start}-${end}`);
        
        visibleReads.forEach((read, index) => {
            const readElement = document.createElement('div');
            readElement.className = 'read-element';
            
            const readStart = Math.max(read.start, start);
            const readEnd = Math.min(read.end, end);
            const left = ((readStart - start) / range) * 100;
            const width = Math.max(((readEnd - readStart) / range) * 100, 0.2);
            
            readElement.style.left = `${left}%`;
            readElement.style.width = `${width}%`;
            readElement.style.height = '12px';
            readElement.style.top = '20px';
            readElement.style.position = 'absolute';
            readElement.style.background = read.strand === '+' ? '#00b894' : '#f39c12';
            readElement.style.borderRadius = '2px';
            readElement.style.cursor = 'pointer';
            
            // Create read tooltip
            const readInfo = `Read: ${read.id || 'Unknown'}\n` +
                              `Position: ${read.start}-${read.end}\n` +
                              `Strand: ${read.strand || 'N/A'}\n` +
                              `Mapping Quality: ${read.mappingQuality || 'N/A'}`;
            
            readElement.title = readInfo;
            
            // Add click handler for detailed info
            readElement.addEventListener('click', () => {
                alert(readInfo);
            });
            
            trackContent.appendChild(readElement);
        });
        
        // Add message if no reads found in this region
        if (visibleReads.length === 0) {
            const noReadsMsg = document.createElement('div');
            noReadsMsg.className = 'no-reads-message';
            noReadsMsg.textContent = 'No reads in this region';
            noReadsMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noReadsMsg);
        }
        
        track.appendChild(trackContent);
        return track;
    }

    createProteinTrack(chromosome) {
        const track = document.createElement('div');
        track.className = 'protein-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'Proteins';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content';
        trackContent.style.height = '80px';
        
        // Add draggable functionality
        this.makeDraggable(trackContent, chromosome);
        
        const annotations = this.currentAnnotations[chromosome] || [];
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const range = end - start;
        
        // Filter for CDS features that can be translated to proteins
        const proteins = annotations.filter(feature => 
            feature.type === 'CDS' &&
            feature.start && feature.end && 
            feature.start <= end && feature.end >= start &&
            this.shouldShowGeneType('CDS')
        );
        
        console.log(`Displaying ${proteins.length} proteins in region ${start}-${end}`);
        
        proteins.forEach((protein, index) => {
            const proteinElement = document.createElement('div');
            proteinElement.className = 'protein-element';
            
            const proteinStart = Math.max(protein.start, start);
            const proteinEnd = Math.min(protein.end, end);
            const left = ((proteinStart - start) / range) * 100;
            const width = Math.max(((proteinEnd - proteinStart) / range) * 100, 0.3);
            
            proteinElement.style.left = `${left}%`;
            proteinElement.style.width = `${Math.max(width, 0.3)}%`;
            
            if (protein.strand === -1) {
                proteinElement.classList.add('reverse-strand');
            }
            
            // Create protein label
            const proteinName = protein.qualifiers.product || protein.qualifiers.gene || protein.qualifiers.locus_tag || 'Protein';
            const proteinInfo = `${proteinName} (CDS)`;
            const positionInfo = `${protein.start}-${protein.end} (${protein.strand === -1 ? '-' : '+'} strand)`;
            
            proteinElement.title = `${proteinInfo}\nPosition: ${positionInfo}`;
            
            // Set text content based on available space
            if (width > 2) {
                proteinElement.textContent = proteinName.length > 10 ? proteinName.substring(0, 10) + '...' : proteinName;
            } else if (width > 0.8) {
                proteinElement.textContent = proteinName.substring(0, 3);
            } else {
                proteinElement.textContent = '';
            }
            
            // Add click handler for detailed info
            proteinElement.addEventListener('click', () => {
                this.showProteinDetails(protein, chromosome);
            });
            
            trackContent.appendChild(proteinElement);
        });
        
        // Add message if no proteins found
        if (proteins.length === 0) {
            const noProteinsMsg = document.createElement('div');
            noProteinsMsg.className = 'no-proteins-message';
            noProteinsMsg.textContent = 'No proteins in this region or CDS filtered out';
            noProteinsMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noProteinsMsg);
        }
        
        track.appendChild(trackContent);
        return track;
    }

    showProteinDetails(protein, chromosome) {
        const sequence = this.currentSequence[chromosome];
        const dnaSequence = sequence.substring(protein.start - 1, protein.end);
        const proteinSequence = this.translateDNA(dnaSequence, protein.strand);
        
        const details = [];
        details.push(`Type: Protein (CDS)`);
        details.push(`Position: ${protein.start}-${protein.end}`);
        details.push(`Strand: ${protein.strand === -1 ? 'Reverse (-)' : 'Forward (+)'}`);
        details.push(`Length: ${protein.end - protein.start + 1} bp (${Math.floor((protein.end - protein.start + 1) / 3)} aa)`);
        details.push(`DNA Sequence: ${dnaSequence.substring(0, 60)}${dnaSequence.length > 60 ? '...' : ''}`);
        details.push(`Protein Sequence: ${proteinSequence.substring(0, 20)}${proteinSequence.length > 20 ? '...' : ''}`);
        
        if (protein.qualifiers) {
            Object.entries(protein.qualifiers).forEach(([key, value]) => {
                // Convert value to string and check if it's meaningful
                const stringValue = value != null ? String(value) : '';
                if (stringValue && stringValue !== 'Unknown') {
                    details.push(`${key}: ${stringValue}`);
                }
            });
        }
        
        alert(details.join('\n'));
    }

    translateDNA(dnaSequence, strand = 1) {
        const geneticCode = {
            'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L',
            'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S',
            'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*',
            'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
            'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L',
            'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
            'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q',
            'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R',
            'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M',
            'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
            'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K',
            'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R',
            'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V',
            'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
            'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E',
            'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G'
        };

        let sequence = dnaSequence.toUpperCase();
        
        // Reverse complement if on negative strand
        if (strand === -1) {
            sequence = this.getReverseComplement(sequence);
        }
        
        let protein = '';
        for (let i = 0; i < sequence.length - 2; i += 3) {
            const codon = sequence.substring(i, i + 3);
            protein += geneticCode[codon] || 'X';
        }
        
        return protein;
    }

    displayEnhancedSequence(chromosome, sequence) {
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const windowSize = end - start;

        // Choose display method based on window size
        if (windowSize <= 500) {
            this.displayDetailedSequence(chromosome, sequence, start, end);
        } else if (windowSize <= 2000) {
            this.displaySequenceWithAnnotations(chromosome, sequence, start, end);
        } else {
            this.displaySequence(chromosome, sequence, start, end); // Pass full sequence and view range
        }

        // Update sequence title
        document.getElementById('sequenceTitle').textContent =
            `${chromosome}:${start + 1}-${end} (${windowSize} bp)`;

        // Show sequence display section and splitter if not already visible
        const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
        if (this.showBottomSequence && sequenceDisplaySection.style.display === 'none') {
            sequenceDisplaySection.style.display = 'block';
            document.getElementById('splitter').style.display = 'flex';
        }
        if (this.showBottomSequence) {
             document.getElementById('sequenceDisplay').style.display = 'flex'; // Ensure content area is visible
        }
        
        // Re-highlight selected gene sequence if there is one
        if (this.selectedGene && this.selectedGene.gene) {
            // Use setTimeout to ensure the DOM is updated before highlighting
            setTimeout(() => {
                this.highlightGeneSequence(this.selectedGene.gene);
            }, 100);
        }

        // Re-initialize sequence selection after content is updated
        setTimeout(() => {
            this.initializeSequenceSelection();
        }, 100);
    }

    measureCharacterWidth(container) {
        // Return cached value if available
        if (this._cachedCharWidth) {
            return this._cachedCharWidth;
        }
        
        // Create a temporary element to measure character width
        const testElement = document.createElement('span');
        testElement.textContent = 'ATCG'; // Use representative DNA bases
        testElement.style.fontFamily = "'Courier New', monospace";
        testElement.style.fontSize = '14px';
        testElement.style.fontWeight = '600';
        testElement.style.visibility = 'hidden';
        testElement.style.position = 'absolute';
        testElement.style.whiteSpace = 'nowrap';
        
        container.appendChild(testElement);
        const width = testElement.offsetWidth / 4; // Divide by 4 since we measured 4 characters
        container.removeChild(testElement);
        
        this._cachedCharWidth = Math.ceil(width); // Round up to be conservative and cache result
        return this._cachedCharWidth;
    }

    displayDetailedSequence(chromosome, fullSequence, viewStart, viewEnd) {
        const container = document.getElementById('sequenceContent');
        const subsequence = fullSequence.substring(viewStart, viewEnd);
        const annotations = this.currentAnnotations[chromosome] || [];
        const operons = this.detectOperons ? this.detectOperons(annotations) : [];

        const containerWidth = container.offsetWidth || 800;
        const charWidth = this.measureCharacterWidth(container); // Use measured width instead of hardcoded 12
        const positionWidth = 100;
        const availableWidth = containerWidth - positionWidth - 40; // 40 for padding/margins
        // Remove upper cap to fill width
        const optimalLineLength = Math.max(10, Math.floor(availableWidth / charWidth));

        let html = '<div class="detailed-sequence-view">';
        html += '<div class="sequence-info"><strong>DNA Sequence (colored by features):</strong></div>';

        for (let i = 0; i < subsequence.length; i += optimalLineLength) {
            const lineSubsequence = subsequence.substring(i, i + optimalLineLength);
            const lineStartPos = viewStart + i;

            html += `<div class="sequence-line">`;
            html += `<span class="sequence-position">${(lineStartPos + 1).toLocaleString()}</span>`;
            html += `<span class="sequence-bases" style="white-space: nowrap; font-size: 0;">${this.colorizeSequenceWithFeatures(lineSubsequence, lineStartPos, annotations, operons)}</span>`;
            html += `</div>`;
        }

        const cdsFeatures = annotations.filter(feature =>
            feature.type === 'CDS' &&
            feature.start <= viewEnd && feature.end >= viewStart &&
            this.shouldShowGeneType('CDS')
        );

        if (cdsFeatures.length > 0) {
            html += '<div class="protein-translations">';
            html += '<div class="sequence-info"><strong>Protein Translations:</strong></div>';

            cdsFeatures.forEach(cds => {
                const cdsDnaStart = Math.max(cds.start, viewStart);
                const cdsDnaEnd = Math.min(cds.end, viewEnd);
                const dnaForTranslation = fullSequence.substring(cds.start - 1, cds.end);

                const proteinSequence = this.translateDNA(dnaForTranslation, cds.strand);
                const geneName = cds.qualifiers.gene || cds.qualifiers.locus_tag || 'Unknown';

                html += `<div class="protein-sequence">`;
                html += `<div class="protein-header">${geneName} (${cds.start}-${cds.end}, ${cds.strand === -1 ? '-' : '+'} strand):</div>`;
                html += `<div class="protein-seq">${this.colorizeProteinSequence(proteinSequence)}</div>`;
                html += `</div>`;
            });
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    displaySequenceWithAnnotations(chromosome, fullSequence, viewStart, viewEnd) {
        const container = document.getElementById('sequenceContent');
        const subsequence = fullSequence.substring(viewStart, viewEnd);
        const annotations = this.currentAnnotations[chromosome] || [];
        const operons = this.detectOperons ? this.detectOperons(annotations) : [];

        const containerWidth = container.offsetWidth || 800;
        const charWidth = this.measureCharacterWidth(container); // Use measured width instead of hardcoded 12
        const positionWidth = 100;
        const availableWidth = containerWidth - positionWidth - 40;
        // Remove upper cap to fill width
        const optimalLineLength = Math.max(10, Math.floor(availableWidth / charWidth));

        let html = '';
        for (let i = 0; i < subsequence.length; i += optimalLineLength) {
            const lineSubsequence = subsequence.substring(i, i + optimalLineLength);
            const lineStartPos = viewStart + i;
            html += `<div class="sequence-line">`;
            html += `<span class="sequence-position">${(lineStartPos + 1).toLocaleString()}</span>`;
            html += `<span class="sequence-bases" style="white-space: nowrap; font-size: 0;">${this.colorizeSequenceWithFeatures(lineSubsequence, lineStartPos, annotations, operons)}</span>`;
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    displaySequence(chromosome, fullSequence, viewStart, viewEnd) {
        const container = document.getElementById('sequenceContent');
        const subsequence = fullSequence.substring(viewStart, viewEnd);
        const annotations = this.currentAnnotations[chromosome] || [];
        const operons = this.detectOperons ? this.detectOperons(annotations) : []; 

        const containerWidth = container.offsetWidth || 800;
        const charWidth = this.measureCharacterWidth(container); // Use measured width instead of hardcoded 12
        const positionWidth = 100;
        const availableWidth = containerWidth - positionWidth - 40;
        // Remove upper cap to fill width
        const optimalLineLength = Math.max(10, Math.floor(availableWidth / charWidth));

        let html = '';
        for (let i = 0; i < subsequence.length; i += optimalLineLength) {
            const lineSubsequence = subsequence.substring(i, i + optimalLineLength);
            const lineStartPos = viewStart + i;
            html += `<div class="sequence-line">`;
            html += `<span class="sequence-position">${(lineStartPos + 1).toLocaleString()}</span>`;
            html += `<span class="sequence-bases" style="white-space: nowrap; font-size: 0;">${this.colorizeSequenceWithFeatures(lineSubsequence, lineStartPos, annotations, operons, false)}</span>`;
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    colorizeSequenceWithFeatures(sequence, lineStartAbs, annotations, operons, simplified = false) {
        let html = '';
        const baseFontSize = '14px'; // Define a base font size to be applied to individual bases

        for (let i = 0; i < sequence.length; i++) {
            const base = sequence[i];
            const absPos = lineStartAbs + i + 1; 
            let featureHexColor = null; 
            let featureTitle = '';
            const baseTextColor = this.getBaseColor(base); 

            const overlappingFeatures = annotations.filter(f => 
                absPos >= f.start && absPos <= f.end && this.shouldShowGeneType(f.type)
            );

            if (overlappingFeatures.length > 0) {
                const sortedFeatures = overlappingFeatures.sort((a,b) => {
                    const typeOrder = { 'CDS': 1, 'mRNA': 2, 'tRNA': 2, 'rRNA': 2, 'promoter': 3, 'terminator': 3, 'regulatory': 3, 'gene': 4 }; 
                    return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
                });
                const mainFeature = sortedFeatures[0];
                const operonInfo = operons && mainFeature.type !== 'promoter' && mainFeature.type !== 'terminator' ? this.getGeneOperonInfo(mainFeature, operons) : null;
                featureHexColor = operonInfo ? operonInfo.color : this.getFeatureTypeColor(mainFeature.type);
                featureTitle = `${mainFeature.qualifiers.gene || mainFeature.qualifiers.locus_tag || mainFeature.type} (${mainFeature.start}-${mainFeature.end})`;
            }

            let style = `color: ${baseTextColor}; font-size: ${baseFontSize}; display: inline-block; padding: 0; margin: 0; vertical-align: top;`;
            if (featureHexColor) {
                const backgroundColorRgba = this.hexToRgba(featureHexColor, 0.1);
                style += ` background-color: ${backgroundColorRgba};`;
            } else {
                style += ` background-color: transparent;`;
            }

            const className = `base-${base.toLowerCase()}`;
            const titleAttr = featureTitle ? `title="${featureTitle}"` : '';
            html += `<span class="${className}" style="${style}" ${titleAttr}>${base}</span>`;
        }
        return html;
    }

    getBaseColor(base) {
        switch (base.toUpperCase()) {
            case 'A': return '#2ecc71'; // Green
            case 'T': return '#e74c3c'; // Red
            case 'G': return '#f39c12'; // Orange
            case 'C': return '#3498db'; // Blue
            default: return '#7f8c8d'; // Grey for N etc.
        }
    }

    getFeatureTypeColor(type, forBorder = false) {
        let color;
        switch (type) {
            case 'CDS': color = '#8e44ad'; break; // Purple
            case 'mRNA': color = '#16a085'; break; // Teal
            case 'tRNA': color = '#27ae60'; break; // Green variant
            case 'rRNA': color = '#2980b9'; break; // Blue variant
            case 'promoter': color = '#f1c40f'; break; // Yellow
            case 'terminator': color = '#d35400'; break; // Orange-Red
            case 'regulatory': color = '#c0392b'; break; // Dark Red
            case 'gene': color = '#7f8c8d'; break; // Mid-grey for general gene (was bdc3c7, darker for better contrast)
            default: color = '#95a5a6'; break; // Default grey for other features
        }
        if (forBorder) {
            // Return a slightly darker version for border
            return this.shadeColor(color, -20);
        }
        return color;
    }

    getContrastingTextColor(backgroundColor) {
        if (!backgroundColor || backgroundColor === 'transparent') return '#333333'; // Default text color if no background
        const color = (backgroundColor.charAt(0) === '#') ? backgroundColor.substring(1, 7) : backgroundColor;
        const r = parseInt(color.substring(0, 2), 16); // hexToR
        const g = parseInt(color.substring(2, 4), 16); // hexToG
        const b = parseInt(color.substring(4, 6), 16); // hexToB
        const uicolors = [r / 255, g / 255, b / 255];
        const c = uicolors.map((col) => {
            if (col <= 0.03928) {
                return col / 12.92;
            }
            return Math.pow((col + 0.055) / 1.055, 2.4);
        });
        const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
        return (L > 0.179) ? '#000000' : '#FFFFFF';
    }

    colorizeProteinSequence(sequence) {
        const aaColors = {
            'A': '#ff6b6b', 'R': '#4ecdc4', 'N': '#45b7d1', 'D': '#f9ca24',
            'C': '#f0932b', 'Q': '#eb4d4b', 'E': '#6c5ce7', 'G': '#a29bfe',
            'H': '#fd79a8', 'I': '#00b894', 'L': '#00cec9', 'K': '#0984e3',
            'M': '#e17055', 'F': '#81ecec', 'P': '#fab1a0', 'S': '#00b894',
            'T': '#55a3ff', 'W': '#fd79a8', 'Y': '#fdcb6e', 'V': '#6c5ce7',
            '*': '#2d3436'
        };
        
        return sequence.split('').map(aa => {
            const color = aaColors[aa] || '#74b9ff';
            return `<span style="color: ${color}; font-weight: bold;">${aa}</span>`;
        }).join('');
    }

    updateBottomSequenceVisibility() {
        const trackBottomSequence = document.getElementById('trackBottomSequence');
        if (!trackBottomSequence) return;
        
        this.showBottomSequence = trackBottomSequence.checked;
        
        const sidebarTrackBottomSequence = document.getElementById('sidebarTrackBottomSequence');
        if (sidebarTrackBottomSequence) {
            sidebarTrackBottomSequence.checked = this.showBottomSequence;
        }
        
        const sequenceSection = document.getElementById('sequenceDisplaySection');
        const splitter = document.getElementById('splitter');
        const genomeSection = document.getElementById('genomeViewerSection');
        
        // Check if welcome screen is visible - improved detection
        const welcomeScreen = document.querySelector('.welcome-screen');
        const welcomeVisible = welcomeScreen && (
            welcomeScreen.style.display === '' || 
            welcomeScreen.style.display === 'flex' || 
            welcomeScreen.style.display === 'block' ||
            (welcomeScreen.style.display !== 'none' && getComputedStyle(welcomeScreen).display !== 'none')
        );

        if (!genomeSection.dataset.originalFlexBasis) { // Ensure originalFlexBasis is cached
            genomeSection.dataset.originalFlexBasis = getComputedStyle(genomeSection).flexBasis || '50%';
        }

        if (welcomeVisible) { // Welcome screen takes precedence
            if (sequenceSection) sequenceSection.style.display = 'none';
            if (splitter) splitter.style.display = 'none';
            if (genomeSection) {
                genomeSection.style.flexGrow = '1';
                genomeSection.style.flexBasis = '100%';
            }
        } else if (this.showBottomSequence) {
            // A file might be loaded or not. displayGenomeView handles file-loaded case.
            // If no file is loaded, we still show the panel structure.
            const currentChr = document.getElementById('chromosomeSelect').value;
            const fileLoaded = currentChr && this.currentSequence && this.currentSequence[currentChr];

            if (fileLoaded) {
                this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
            } else {
                // No file loaded, but showBottomSequence is true: show empty panel structure
                if (sequenceSection) sequenceSection.style.display = 'flex';
                if (document.getElementById('sequenceDisplay')) document.getElementById('sequenceDisplay').style.display = 'flex';
                if (document.getElementById('sequenceContent')) document.getElementById('sequenceContent').innerHTML = ''; // Clear content
                if (document.getElementById('sequenceTitle')) document.getElementById('sequenceTitle').textContent = 'Sequence'; // Reset title
                
                if (splitter) splitter.style.display = 'flex';
                if (genomeSection) {
                    genomeSection.style.flexGrow = '0'; // Don't grow
                    genomeSection.style.flexBasis = genomeSection.dataset.originalFlexBasis; // Default basis
                }
            }
        } else { // Bottom sequence hidden, and welcome screen is also hidden
            if (sequenceSection) sequenceSection.style.display = 'none';
            if (splitter) splitter.style.display = 'none';
            if (genomeSection) {
                genomeSection.style.flexGrow = '1';
                genomeSection.style.flexBasis = '100%';
            }
        }
    }

    updateBottomSequenceVisibilityFromSidebar() {
        const sidebarTrackBottomSequence = document.getElementById('sidebarTrackBottomSequence');
        if (!sidebarTrackBottomSequence) return;
        
        this.showBottomSequence = sidebarTrackBottomSequence.checked;
        
        // Sync with toolbar
        const trackBottomSequence = document.getElementById('trackBottomSequence');
        if (trackBottomSequence) {
            trackBottomSequence.checked = this.showBottomSequence;
        }
        
        // Show/hide sequence display section and splitter
        const sequenceSection = document.getElementById('sequenceDisplaySection');
        const splitter = document.getElementById('splitter');
        
        if (this.showBottomSequence) {
            // Refresh the genome view if a file is loaded
            const currentChr = document.getElementById('chromosomeSelect').value;
            if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
                this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
            }
        } else {
            // Hide sequence display section and splitter
            if (sequenceSection) sequenceSection.style.display = 'none';
            if (splitter) splitter.style.display = 'none';
            
            // Reset genome section to take full space
            const genomeSection = document.getElementById('genomeViewerSection');
            if (genomeSection) {
                genomeSection.style.flex = '1';
                genomeSection.style.height = 'auto';
            }
        }
    }

    updateVisibleTracks() {
        // Get selected tracks from toolbar checkboxes
        const tracks = new Set();
        const trackGenes = document.getElementById('trackGenes');
        const trackGC = document.getElementById('trackGC');
        const trackVariants = document.getElementById('trackVariants');
        const trackReads = document.getElementById('trackReads');
        const trackProteins = document.getElementById('trackProteins');
        
        if (trackGenes && trackGenes.checked) tracks.add('genes');
        if (trackGC && trackGC.checked) tracks.add('gc');
        if (trackVariants && trackVariants.checked) tracks.add('variants');
        if (trackReads && trackReads.checked) tracks.add('reads');
        if (trackProteins && trackProteins.checked) tracks.add('proteins');
        
        this.visibleTracks = tracks;
        
        // Sync with sidebar
        const sidebarTrackGenes = document.getElementById('sidebarTrackGenes');
        const sidebarTrackGC = document.getElementById('sidebarTrackGC');
        const sidebarTrackVariants = document.getElementById('sidebarTrackVariants');
        const sidebarTrackReads = document.getElementById('sidebarTrackReads');
        const sidebarTrackProteins = document.getElementById('sidebarTrackProteins');
        
        if (sidebarTrackGenes) sidebarTrackGenes.checked = tracks.has('genes');
        if (sidebarTrackGC) sidebarTrackGC.checked = tracks.has('gc');
        if (sidebarTrackVariants) sidebarTrackVariants.checked = tracks.has('variants');
        if (sidebarTrackReads) sidebarTrackReads.checked = tracks.has('reads');
        if (sidebarTrackProteins) sidebarTrackProteins.checked = tracks.has('proteins');
        
        // Refresh the genome view if a file is loaded
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    updateVisibleTracksFromSidebar() {
        // Get selected tracks from sidebar checkboxes
        const tracks = new Set();
        const sidebarTrackGenes = document.getElementById('sidebarTrackGenes');
        const sidebarTrackGC = document.getElementById('sidebarTrackGC');
        const sidebarTrackVariants = document.getElementById('sidebarTrackVariants');
        const sidebarTrackReads = document.getElementById('sidebarTrackReads');
        const sidebarTrackProteins = document.getElementById('sidebarTrackProteins');
        
        if (sidebarTrackGenes && sidebarTrackGenes.checked) tracks.add('genes');
        if (sidebarTrackGC && sidebarTrackGC.checked) tracks.add('gc');
        if (sidebarTrackVariants && sidebarTrackVariants.checked) tracks.add('variants');
        if (sidebarTrackReads && sidebarTrackReads.checked) tracks.add('reads');
        if (sidebarTrackProteins && sidebarTrackProteins.checked) tracks.add('proteins');
        
        this.visibleTracks = tracks;
        
        // Sync with toolbar
        const trackGenes = document.getElementById('trackGenes');
        const trackGC = document.getElementById('trackGC');
        const trackVariants = document.getElementById('trackVariants');
        const trackReads = document.getElementById('trackReads');
        const trackProteins = document.getElementById('trackProteins');
        
        if (trackGenes) trackGenes.checked = tracks.has('genes');
        if (trackGC) trackGC.checked = tracks.has('gc');
        if (trackVariants) trackVariants.checked = tracks.has('variants');
        if (trackReads) trackReads.checked = tracks.has('reads');
        if (trackProteins) trackProteins.checked = tracks.has('proteins');
        
        // Refresh the genome view if a file is loaded
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    createVariantTrack(chromosome) {
        const track = document.createElement('div');
        track.className = 'variant-track';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'track-header';
        trackHeader.textContent = 'VCF Variants';
        track.appendChild(trackHeader);
        
        const trackContent = document.createElement('div');
        trackContent.className = 'track-content';
        trackContent.style.height = '60px';
        
        // Add draggable functionality
        this.makeDraggable(trackContent, chromosome);
        
        const variants = this.currentVariants[chromosome] || [];
        const start = this.currentPosition.start;
        const end = this.currentPosition.end;
        const range = end - start;
        
        // Check if we have any variant data at all
        if (!this.currentVariants || Object.keys(this.currentVariants).length === 0) {
            const noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-variants-message';
            noDataMsg.textContent = 'No VCF file loaded. Load a VCF file to see variants.';
            noDataMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noDataMsg);
            track.appendChild(trackContent);
            return track;
        }
        
        // Filter for variants in the current region
        const visibleVariants = variants.filter(variant => 
            variant.start && variant.end && 
            variant.start <= end && variant.end >= start
        );
        
        console.log(`Displaying ${visibleVariants.length} variants in region ${start}-${end}`);
        
        visibleVariants.forEach((variant, index) => {
            const variantElement = document.createElement('div');
            variantElement.className = 'variant-element';
            
            const variantStart = Math.max(variant.start, start);
            const variantEnd = Math.min(variant.end, end);
            const left = ((variantStart - start) / range) * 100;
            const width = Math.max(((variantEnd - variantStart) / range) * 100, 0.2);
            
            variantElement.style.left = `${left}%`;
            variantElement.style.width = `${width}%`;
            variantElement.style.height = '12px';
            variantElement.style.top = '20px';
            variantElement.style.position = 'absolute';
            variantElement.style.background = '#e74c3c';
            variantElement.style.borderRadius = '2px';
            variantElement.style.cursor = 'pointer';
            
            // Create variant tooltip
            const variantInfo = `Variant: ${variant.id || 'Unknown'}\n` +
                              `Position: ${variant.start}-${variant.end}\n` +
                              `Ref: ${variant.ref || 'N/A'}\n` +
                              `Alt: ${variant.alt || 'N/A'}\n` +
                              `Quality: ${variant.quality || 'N/A'}`;
            
            variantElement.title = variantInfo;
            
            // Add click handler for detailed info
            variantElement.addEventListener('click', () => {
                alert(variantInfo);
            });
            
            trackContent.appendChild(variantElement);
        });
        
        // Add message if no variants found in this region
        if (visibleVariants.length === 0) {
            const noVariantsMsg = document.createElement('div');
            noVariantsMsg.className = 'no-variants-message';
            noVariantsMsg.textContent = 'No variants in this region';
            noVariantsMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-style: italic;
                font-size: 12px;
            `;
            trackContent.appendChild(noVariantsMsg);
        }
        
        track.appendChild(trackContent);
        return track;
    }

    shouldShowGeneType(type) {
        const typeMap = {
            'gene': 'genes',
            'CDS': 'CDS',
            'mRNA': 'mRNA',
            'tRNA': 'tRNA',
            'rRNA': 'rRNA',
            'promoter': 'promoter',
            'terminator': 'terminator',
            'regulatory': 'regulatory',
            'misc_feature': 'other',
            'repeat_region': 'other'
        };
        
        const filterKey = typeMap[type] || 'other';
        return this.geneFilters[filterKey];
    }

    updateGeneDisplay() {
        // Refresh the genome view if a file is loaded
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    // New method to arrange genes into non-overlapping rows (copied from TrackRenderer.js)
    arrangeGenesInRows(genes, viewStart, viewEnd) {
        // Sort genes by start position
        const sortedGenes = [...genes].sort((a, b) => a.start - b.start);
        const rows = [];
        
        sortedGenes.forEach(gene => {
            let placed = false;
            
            // Try to place gene in existing rows
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                let canPlace = true;
                
                // Check if gene overlaps with any gene in this row
                for (const existingGene of row) {
                    if (this.genesOverlap(gene, existingGene)) {
                        canPlace = false;
                        break;
                    }
                }
                
                if (canPlace) {
                    row.push(gene);
                    placed = true;
                    break;
                }
            }
            
            // If couldn't place in existing row, create new row
            if (!placed) {
                rows.push([gene]);
            }
        });
        
        return rows;
    }

    // Helper to check if two genes overlap with a buffer (copied from TrackRenderer.js)
    genesOverlap(gene1, gene2) {
        const buffer = 10; // Reduced buffer from 50bp to 10bp for tighter packing
        return (gene1.start < gene2.end + buffer && gene1.end + buffer > gene2.start);
    }

    syncSidebarFeatureFilter(sidebarId, checked) {
        const sidebarElement = document.getElementById(sidebarId);
        if (sidebarElement) {
            sidebarElement.checked = checked;
        }
    }

    syncToolbarFeatureFilter(toolbarId, checked) {
        const toolbarElement = document.getElementById(toolbarId);
        if (toolbarElement) {
            toolbarElement.checked = checked;
        }
    }

    toggleFeatureFilters() {
        const checkboxes = document.getElementById('featureFilterCheckboxes');
        const button = document.getElementById('toggleFeatureFilters');
        
        if (checkboxes.style.display === 'none' || checkboxes.style.display === '') {
            checkboxes.style.display = 'grid'; // Use grid as defined in CSS
            button.classList.add('active');
        } else {
            checkboxes.style.display = 'none';
            button.classList.remove('active');
        }
    }
    
    toggleTracks() {
        const checkboxes = document.getElementById('trackCheckboxes');
        const button = document.getElementById('toggleTracks');
        
        if (checkboxes.style.display === 'none' || checkboxes.style.display === '') {
            checkboxes.style.display = 'flex'; // Use flex as defined in CSS
            button.classList.add('active');
        } else {
            checkboxes.style.display = 'none';
            button.classList.remove('active');
        }
    }

    hideTracksPanel() {
        const checkboxes = document.getElementById('trackCheckboxes');
        const button = document.getElementById('toggleTracks');
        
        if (checkboxes && checkboxes.style.display !== 'none') {
            checkboxes.style.display = 'none';
            button.classList.remove('active');
        }
    }

    hideFeatureFiltersPanel() {
        const checkboxes = document.getElementById('featureFilterCheckboxes');
        const button = document.getElementById('toggleFeatureFilters');
        
        if (checkboxes && checkboxes.style.display !== 'none') {
            checkboxes.style.display = 'none';
            button.classList.remove('active');
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const horizontalSplitter = document.getElementById('horizontalSplitter');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar.classList.contains('collapsed')) {
            // Show sidebar
            sidebar.classList.remove('collapsed');
            horizontalSplitter.classList.remove('hidden');
            mainContent.classList.remove('sidebar-collapsed');
        } else {
            // Hide sidebar
            sidebar.classList.add('collapsed');
            horizontalSplitter.classList.add('hidden');
            mainContent.classList.add('sidebar-collapsed');
        }
        
        // Update all toggle button states
        this.updateToggleButtonStates();
        
        // Trigger a resize event to ensure proper layout adjustment
        window.dispatchEvent(new Event('resize'));
    }

    showPanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.style.display = 'block';
            
            // Show sidebar and splitter if they were hidden
            this.showSidebarIfHidden();
        }
    }

    closePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.style.display = 'none';
            
            // Special handling for gene details panel
            if (panelId === 'geneDetailsSection') {
                this.clearGeneSelection();
            }
            
            // Check if all panels are closed and hide sidebar if so
            this.checkAndHideSidebarIfAllPanelsClosed();
        }
    }

    clearGeneSelection() {
        // Clear selected gene
        this.selectedGene = null;
        
        // Remove selection styling from all gene elements
        const selectedElements = document.querySelectorAll('.gene-element.selected');
        selectedElements.forEach(el => el.classList.remove('selected'));
        
        // Clear sequence highlights
        this.clearSequenceHighlights();
        
        console.log('Cleared gene selection');
    }

    checkAndHideSidebarIfAllPanelsClosed() {
        const sidebar = document.getElementById('sidebar');
        const horizontalSplitter = document.getElementById('horizontalSplitter');
        const mainContent = document.querySelector('.main-content');
        const splitterToggleBtn = document.getElementById('splitterToggleBtn');
        const floatingToggleBtn = document.getElementById('floatingToggleBtn');
        
        // Get all sidebar sections
        const allPanels = document.querySelectorAll('.sidebar-section');
        const visiblePanels = Array.from(allPanels).filter(panel => 
            panel.style.display !== 'none'
        );
        
        if (visiblePanels.length === 0) {
            // All panels are closed, hide sidebar
            sidebar.classList.add('collapsed');
            horizontalSplitter.classList.add('hidden');
            mainContent.classList.add('sidebar-collapsed');
            
            // Update splitter toggle button
            if (splitterToggleBtn) {
                splitterToggleBtn.classList.add('collapsed');
                splitterToggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                splitterToggleBtn.title = 'Show Sidebar';
            }
            
            // Show floating toggle button
            if (floatingToggleBtn) {
                floatingToggleBtn.style.display = 'flex';
            }
            
            // Trigger resize event
            window.dispatchEvent(new Event('resize'));
        }
    }

    showSidebarIfHidden() {
        const sidebar = document.getElementById('sidebar');
        const horizontalSplitter = document.getElementById('horizontalSplitter');
        const mainContent = document.querySelector('.main-content');
        const splitterToggleBtn = document.getElementById('splitterToggleBtn');
        
        if (sidebar.classList.contains('collapsed')) {
            // Show sidebar and splitter
            sidebar.classList.remove('collapsed');
            horizontalSplitter.classList.remove('hidden');
            mainContent.classList.remove('sidebar-collapsed');
            
            // Update splitter toggle button
            if (splitterToggleBtn) {
                splitterToggleBtn.classList.remove('collapsed');
                splitterToggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                splitterToggleBtn.title = 'Hide Sidebar';
            }
            
            // Trigger resize event
            window.dispatchEvent(new Event('resize'));
        }
    }

    showAllPanels() {
        const panels = document.querySelectorAll('.sidebar-section');
        panels.forEach(panel => {
            panel.style.display = 'block';
        });
    }

    updateFileInfo() {
        const fileInfo = document.getElementById('fileInfo');
        if (this.currentFile) {
            const info = this.currentFile.info;
            fileInfo.innerHTML = `
                <div class="file-detail">
                    <strong>Name:</strong> ${info.name}
                </div>
                <div class="file-detail">
                    <strong>Size:</strong> ${(info.size / 1024).toFixed(2)} KB
                </div>
                <div class="file-detail">
                    <strong>Type:</strong> ${info.extension}
                </div>
                <div class="file-detail">
                    <strong>Sequences:</strong> ${Object.keys(this.currentSequence || {}).length}
                </div>
            `;
        } else {
            fileInfo.innerHTML = '<p class="no-file">No file loaded</p>';
        }
    }

    hideWelcomeScreen() {
        const welcomeScreen = document.querySelector('.welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            
            // After hiding welcome screen, ensure proper panel layout
            const genomeViewerSection = document.getElementById('genomeViewerSection');
            const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
            const splitter = document.getElementById('splitter');
            
            if (!genomeViewerSection.dataset.originalFlexBasis) {
                genomeViewerSection.dataset.originalFlexBasis = getComputedStyle(genomeViewerSection).flexBasis || '50%';
            }
            
            // Set initial layout based on showBottomSequence setting
            if (this.showBottomSequence) {
                if (genomeViewerSection) {
                    genomeViewerSection.style.flexGrow = '0';
                    genomeViewerSection.style.flexBasis = genomeViewerSection.dataset.originalFlexBasis;
                }
                if (sequenceDisplaySection) sequenceDisplaySection.style.display = 'flex';
                if (splitter) splitter.style.display = 'flex';
            } else {
                if (genomeViewerSection) {
                    genomeViewerSection.style.flexGrow = '1';
                    genomeViewerSection.style.flexBasis = '100%';
                }
                if (sequenceDisplaySection) sequenceDisplaySection.style.display = 'none';
                if (splitter) splitter.style.display = 'none';
            }
        }
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    createGCContentVisualization(sequence) {
        const gcDisplay = document.createElement('div');
        gcDisplay.className = 'gc-content-display';
        gcDisplay.style.position = 'relative';
        gcDisplay.style.height = '60px';
        gcDisplay.style.background = 'rgba(255, 255, 255, 0.1)';
        gcDisplay.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        gcDisplay.style.borderRadius = '4px';
        
        const windowSize = Math.max(10, Math.floor(sequence.length / 50));
        
        for (let i = 0; i < sequence.length - windowSize; i += windowSize) {
            const window = sequence.substring(i, i + windowSize);
            const gcCount = (window.match(/[GC]/g) || []).length;
            const gcPercent = (gcCount / windowSize) * 100;
            
            const bar = document.createElement('div');
            bar.className = 'gc-bar';
            bar.style.position = 'absolute';
            bar.style.left = `${(i / sequence.length) * 100}%`;
            bar.style.width = `${(windowSize / sequence.length) * 100}%`;
            bar.style.height = `${(gcPercent / 100) * 50}px`;
            bar.style.bottom = '5px';
            bar.style.background = `hsl(${120 - (gcPercent * 1.2)}, 70%, 50%)`;
            bar.style.borderRadius = '2px';
            bar.title = `GC Content: ${gcPercent.toFixed(1)}%`;
            
            gcDisplay.appendChild(bar);
        }
        
        return gcDisplay;
    }

    getReverseComplement(sequence) {
        const complement = {
            'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G',
            'N': 'N', 'R': 'Y', 'Y': 'R', 'S': 'S',
            'W': 'W', 'K': 'M', 'M': 'K', 'B': 'V',
            'D': 'H', 'H': 'D', 'V': 'B'
        };
        
        return sequence.split('').reverse().map(base => complement[base] || base).join('');
    }

    // Navigation methods
    navigatePrevious() {
        const range = this.currentPosition.end - this.currentPosition.start;
        const newStart = Math.max(0, this.currentPosition.start - range);
        const newEnd = newStart + range;
        
        this.currentPosition = { start: newStart, end: newEnd };
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.updateStatistics(currentChr, this.currentSequence[currentChr]);
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    navigateNext() {
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) return;
        
        const sequence = this.currentSequence[currentChr];
        const range = this.currentPosition.end - this.currentPosition.start;
        const newStart = this.currentPosition.start + range;
        const newEnd = Math.min(sequence.length, newStart + range);
        
        if (newStart < sequence.length) {
            this.currentPosition = { start: newStart, end: newEnd };
            this.updateStatistics(currentChr, sequence);
            this.displayGenomeView(currentChr, sequence);
        }
    }

    // Zoom methods
    zoomIn() {
        const currentRange = this.currentPosition.end - this.currentPosition.start;
        const newRange = Math.max(100, Math.floor(currentRange / 2));
        const center = Math.floor((this.currentPosition.start + this.currentPosition.end) / 2);
        const newStart = Math.max(0, center - Math.floor(newRange / 2));
        const newEnd = newStart + newRange;
        
        this.currentPosition = { start: newStart, end: newEnd };
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.updateStatistics(currentChr, this.currentSequence[currentChr]);
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    zoomOut() {
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) return;
        
        const sequence = this.currentSequence[currentChr];
        const currentRange = this.currentPosition.end - this.currentPosition.start;
        const newRange = Math.min(sequence.length, currentRange * 2);
        const center = Math.floor((this.currentPosition.start + this.currentPosition.end) / 2);
        const newStart = Math.max(0, center - Math.floor(newRange / 2));
        const newEnd = Math.min(sequence.length, newStart + newRange);
        
        this.currentPosition = { start: newStart, end: newEnd };
        this.updateStatistics(currentChr, sequence);
        this.displayGenomeView(currentChr, sequence);
    }

    resetZoom() {
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) return;
        
        const sequence = this.currentSequence[currentChr];
        this.currentPosition = { start: 0, end: Math.min(10000, sequence.length) };
        this.updateStatistics(currentChr, sequence);
        this.displayGenomeView(currentChr, sequence);
    }

    // Search and navigation methods
    showSearchModal() {
        const modal = document.getElementById('searchModal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('modalSearchInput').focus();
        }
    }

    showGotoModal() {
        const modal = document.getElementById('gotoModal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('modalPositionInput').focus();
        }
    }

    goToPosition() {
        const input = document.getElementById('positionInput').value.trim();
        this.parseAndGoToPosition(input);
    }

    performGoto() {
        const input = document.getElementById('modalPositionInput').value.trim();
        this.parseAndGoToPosition(input);
        document.getElementById('gotoModal').classList.remove('show');
    }

    parseAndGoToPosition(input) {
        if (!input) return;
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('Please select a chromosome first');
            return;
        }
        
        const sequence = this.currentSequence[currentChr];
        let start, end;
        
        // Parse different formats: "1000", "1000-2000", "chr1:1000-2000"
        if (input.includes(':')) {
            const [chr, range] = input.split(':');
            if (range.includes('-')) {
                const [s, e] = range.split('-');
                start = parseInt(s) - 1; // Convert to 0-based
                end = parseInt(e);
            } else {
                start = parseInt(range) - 1;
                end = start + 1000;
            }
        } else if (input.includes('-')) {
            const [s, e] = input.split('-');
            start = parseInt(s) - 1;
            end = parseInt(e);
        } else {
            start = parseInt(input) - 1;
            end = start + 1000;
        }
        
        // Validate and adjust bounds
        start = Math.max(0, start);
        end = Math.min(sequence.length, end);
        
        if (start >= end) {
            alert('Invalid position range');
            return;
        }
        
        this.currentPosition = { start, end };
        this.updateStatistics(currentChr, sequence);
        this.displayGenomeView(currentChr, sequence);
    }

    quickSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            this.performSearch(query);
        }
    }

    performSearch(query = null) {
        const searchQuery = query || document.getElementById('modalSearchInput').value.trim();
        if (!searchQuery) return;
        
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('Please select a chromosome first');
            return;
        }
        
        const sequence = this.currentSequence[currentChr];
        const caseSensitive = document.getElementById('caseSensitive')?.checked || false;
        const includeReverseComplement = document.getElementById('reverseComplement')?.checked || false;
        
        // Prepare search query based on case sensitivity
        const searchTerm = caseSensitive ? searchQuery : searchQuery.toUpperCase();
        const sequenceToSearch = caseSensitive ? sequence : sequence.toUpperCase();
        
        const results = [];
        
        // 1. Search for gene names in annotations
        if (this.currentAnnotations && this.currentAnnotations[currentChr]) {
            const annotations = this.currentAnnotations[currentChr];
            
            annotations.forEach(annotation => {
                if (annotation.qualifiers) {
                    // Search in gene names
                    const geneName = annotation.qualifiers.gene || '';
                    const locusTag = annotation.qualifiers.locus_tag || '';
                    const product = annotation.qualifiers.product || '';
                    const note = annotation.qualifiers.note || '';
                    
                    const searchFields = [geneName, locusTag, product, note].join(' ');
                    const fieldToSearch = caseSensitive ? searchFields : searchFields.toUpperCase();
                    
                    if (fieldToSearch.includes(searchTerm)) {
                        results.push({
                            type: 'gene',
                            position: annotation.start,
                            end: annotation.end,
                            name: geneName || locusTag || annotation.type,
                            details: `${annotation.type}: ${product || 'No description'}`,
                            annotation: annotation
                        });
                    }
                }
            });
        }
        
        // 2. Search for exact sequence matches
        if (searchTerm.match(/^[ATGCN]+$/i)) { // Only search if it looks like a DNA sequence
            let index = sequenceToSearch.indexOf(searchTerm);
            while (index !== -1) {
                results.push({
                    type: 'sequence',
                    position: index,
                    end: index + searchTerm.length,
                    name: `Sequence match`,
                    details: `Found "${searchQuery}" at position ${index + 1}`
                });
                index = sequenceToSearch.indexOf(searchTerm, index + 1);
            }
            
            // 3. Search for reverse complement if requested
            if (includeReverseComplement && searchTerm.match(/^[ATGC]+$/i)) {
                const reverseComplement = this.getReverseComplement(searchTerm);
                const rcToSearch = caseSensitive ? reverseComplement : reverseComplement.toUpperCase();
                
                let rcIndex = sequenceToSearch.indexOf(rcToSearch);
                while (rcIndex !== -1) {
                    results.push({
                        type: 'sequence',
                        position: rcIndex,
                        end: rcIndex + rcToSearch.length,
                        name: `Reverse complement match`,
                        details: `Found reverse complement "${reverseComplement}" at position ${rcIndex + 1}`
                    });
                    rcIndex = sequenceToSearch.indexOf(rcToSearch, rcIndex + 1);
                }
            }
        }
        
        // Sort results by position
        results.sort((a, b) => a.position - b.position);
        
        if (results.length > 0) {
            // Store results for navigation
            this.searchResults = results;
            this.currentSearchIndex = 0;
            
            // Populate search results panel
            this.populateSearchResults(results, searchQuery);
            
            // Navigate to first result automatically
            this.navigateToSearchResult(0);
            
            // Show brief success message
            this.updateStatus(`Found ${results.length} match${results.length > 1 ? 'es' : ''} for "${searchQuery}"`);
        } else {
            let searchInfo = `No matches found for "${searchQuery}"`;
            if (includeReverseComplement && searchQuery.match(/^[ATGC]+$/i)) {
                const rc = this.getReverseComplement(searchQuery);
                searchInfo += ` (also searched for reverse complement: "${rc}")`;
            }
            this.updateStatus(searchInfo);
        }
        
        // Close modal if it was opened
        const modal = document.getElementById('searchModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    copySequence() {
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('No sequence to copy');
            return;
        }
        
        const fullSequence = this.currentSequence[currentChr];
        let textToCopy = '';
        let sourceDescription = '';
        
        // Priority 1: Manual sequence selection
        if (this.currentSequenceSelection) {
            const start = this.currentSequenceSelection.start;
            const end = this.currentSequenceSelection.end;
            textToCopy = fullSequence.substring(start, end + 1);
            sourceDescription = `selected region ${start + 1}-${end + 1}`;
        }
        // Priority 2: Gene-based selection
        else if (this.selectedGene && this.selectedGene.gene) {
            const gene = this.selectedGene.gene;
            textToCopy = fullSequence.substring(gene.start - 1, gene.end);
            const geneName = gene.qualifiers?.gene || gene.qualifiers?.locus_tag || gene.type;
            sourceDescription = `gene ${geneName} (${gene.start}-${gene.end})`;
        }
        // Priority 3: Current view window
        else {
            textToCopy = fullSequence.substring(this.currentPosition.start, this.currentPosition.end);
            sourceDescription = `current view (${this.currentPosition.start + 1}-${this.currentPosition.end})`;
        }
        
        if (!textToCopy) {
            alert('No sequence to copy');
            return;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(`Copied ${textToCopy.length} bases from ${sourceDescription} to clipboard`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        });
    }

    exportSequence() {
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (!currentChr || !this.currentSequence || !this.currentSequence[currentChr]) {
            alert('No sequence to export');
            return;
        }
        
        const sequence = this.currentSequence[currentChr];
        const subsequence = sequence.substring(this.currentPosition.start, this.currentPosition.end);
        
        const fastaContent = `>${currentChr}:${this.currentPosition.start + 1}-${this.currentPosition.end}\n${subsequence}`;
        
        const blob = new Blob([fastaContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentChr}_${this.currentPosition.start + 1}-${this.currentPosition.end}.fasta`;
        a.click();
        URL.revokeObjectURL(url);
    }

    autoEnableTracksForFileType(extension) {
        // Auto-enable tracks based on the file type that was just loaded
        const trackCheckboxes = {
            toolbar: {
                variants: document.getElementById('trackVariants'),
                reads: document.getElementById('trackReads')
            },
            sidebar: {
                variants: document.getElementById('sidebarTrackVariants'),
                reads: document.getElementById('sidebarTrackReads')
            }
        };

        let tracksToEnable = [];
        let statusMessage = '';

        switch (extension.toLowerCase()) {
            case '.vcf':
                tracksToEnable = ['variants'];
                statusMessage = 'VCF Variants track automatically enabled';
                break;
            case '.sam':
            case '.bam':
                tracksToEnable = ['reads'];
                statusMessage = 'Aligned Reads track automatically enabled';
                break;
        }

        // Enable the tracks
        if (tracksToEnable.length > 0) {
            tracksToEnable.forEach(trackType => {
                // Enable in toolbar
                if (trackCheckboxes.toolbar[trackType]) {
                    trackCheckboxes.toolbar[trackType].checked = true;
                }
                // Enable in sidebar
                if (trackCheckboxes.sidebar[trackType]) {
                    trackCheckboxes.sidebar[trackType].checked = true;
                }
                // Add to visible tracks
                this.visibleTracks.add(trackType);
            });

            // Update the genome view to show the new tracks
            this.updateVisibleTracks();
            
            // Show status message
            this.updateStatus(statusMessage);
        }
    }

    async parseVCF() {
        const lines = this.currentFile.data.split('\n');
        const variants = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip header lines and empty lines
            if (trimmed.startsWith('#') || !trimmed) continue;
            
            const fields = trimmed.split('\t');
            if (fields.length < 8) continue;
            
            const [chrom, pos, id, ref, alt, qual, filter, info] = fields;
            
            if (!variants[chrom]) {
                variants[chrom] = [];
            }
            
            const variant = {
                chromosome: chrom,
                start: parseInt(pos) - 1, // Convert to 0-based
                end: parseInt(pos) - 1 + ref.length,
                id: id === '.' ? null : id,
                ref: ref,
                alt: alt,
                quality: qual === '.' ? null : parseFloat(qual),
                filter: filter,
                info: info
            };
            
            variants[chrom].push(variant);
        }
        
        this.currentVariants = variants;
        this.updateStatus(`Loaded VCF file with variants for ${Object.keys(variants).length} chromosome(s)`);
        
        // Auto-enable variants track
        this.autoEnableTracksForFileType('.vcf');
        
        // If we already have sequence data, refresh the view
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    async parseSAM() {
        const lines = this.currentFile.data.split('\n');
        const reads = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip header lines and empty lines
            if (trimmed.startsWith('@') || !trimmed) continue;
            
            const fields = trimmed.split('\t');
            if (fields.length < 11) continue;
            
            const [qname, flag, rname, pos, mapq, cigar, rnext, pnext, tlen, seq, qual] = fields;
            
            // Skip unmapped reads
            if (rname === '*' || pos === '0') continue;
            
            if (!reads[rname]) {
                reads[rname] = [];
            }
            
            const read = {
                id: qname,
                chromosome: rname,
                start: parseInt(pos) - 1, // Convert to 0-based
                end: parseInt(pos) - 1 + seq.length, // Approximate end position
                strand: (parseInt(flag) & 16) ? '-' : '+',
                mappingQuality: parseInt(mapq),
                cigar: cigar,
                sequence: seq,
                quality: qual
            };
            
            reads[rname].push(read);
        }
        
        this.currentReads = reads;
        this.updateStatus(`Loaded SAM file with reads for ${Object.keys(reads).length} chromosome(s)`);
        
        // Auto-enable reads track
        this.autoEnableTracksForFileType('.sam');
        
        // If we already have sequence data, refresh the view
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    async parseGFF() {
        const lines = this.currentFile.data.split('\n');
        const annotations = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip header lines and empty lines
            if (trimmed.startsWith('#') || !trimmed) continue;
            
            const fields = trimmed.split('\t');
            if (fields.length < 9) continue;
            
            const [seqname, source, feature, start, end, score, strand, frame, attribute] = fields;
            
            if (!annotations[seqname]) {
                annotations[seqname] = [];
            }
            
            // Parse attributes
            const qualifiers = {};
            const attrs = attribute.split(';');
            for (const attr of attrs) {
                const [key, value] = attr.split('=');
                if (key && value) {
                    qualifiers[key.trim()] = value.trim().replace(/"/g, '');
                }
            }
            
            const annotation = {
                type: feature,
                start: parseInt(start),
                end: parseInt(end),
                strand: strand === '-' ? -1 : 1,
                score: score === '.' ? null : parseFloat(score),
                source: source,
                qualifiers: qualifiers
            };
            
            annotations[seqname].push(annotation);
        }
        
        this.currentAnnotations = annotations;
        this.updateStatus(`Loaded GFF file with annotations for ${Object.keys(annotations).length} sequence(s)`);
        
        // If we already have sequence data, refresh the view
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    async parseBED() {
        const lines = this.currentFile.data.split('\n');
        const annotations = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip header lines and empty lines
            if (trimmed.startsWith('#') || trimmed.startsWith('track') || !trimmed) continue;
            
            const fields = trimmed.split('\t');
            if (fields.length < 3) continue;
            
            const chrom = fields[0];
            const start = parseInt(fields[1]);
            const end = parseInt(fields[2]);
            const name = fields[3] || 'BED_feature';
            const score = fields[4] ? parseFloat(fields[4]) : null;
            const strand = fields[5] === '-' ? -1 : 1;
            
            if (!annotations[chrom]) {
                annotations[chrom] = [];
            }
            
            const annotation = {
                type: 'BED_feature',
                start: start + 1, // Convert to 1-based
                end: end,
                strand: strand,
                score: score,
                qualifiers: {
                    name: name,
                    score: score
                }
            };
            
            annotations[chrom].push(annotation);
        }
        
        this.currentAnnotations = annotations;
        this.updateStatus(`Loaded BED file with features for ${Object.keys(annotations).length} chromosome(s)`);
        
        // If we already have sequence data, refresh the view
        const currentChr = document.getElementById('chromosomeSelect').value;
        if (currentChr && this.currentSequence && this.currentSequence[currentChr]) {
            this.displayGenomeView(currentChr, this.currentSequence[currentChr]);
        }
    }

    // Initialize horizontal splitter functionality
    initializeHorizontalSplitter() {
        const horizontalSplitter = document.getElementById('horizontalSplitter');
        const sidebar = document.getElementById('sidebar');
        const viewerContainer = document.getElementById('viewerContainer');
        const mainContent = document.querySelector('.main-content');
        
        if (!horizontalSplitter || !sidebar || !viewerContainer || !mainContent) {
            console.warn('Horizontal splitter elements not found, skipping initialization');
            return;
        }
        
        let isResizing = false;
        let startX = 0;
        let startSidebarWidth = 0;
        
        // Mouse events for dragging
        horizontalSplitter.addEventListener('mousedown', (e) => {
            // Don't start resizing if clicking on the toggle button
            if (e.target.closest('.splitter-toggle-btn')) {
                return;
            }
            
            isResizing = true;
            startX = e.clientX;
            startSidebarWidth = sidebar.offsetWidth;
            
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            horizontalSplitter.classList.add('active');
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const newSidebarWidth = startSidebarWidth + deltaX;
            
            // Set minimum and maximum widths
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.5; // Max 50% of window width
            
            if (newSidebarWidth >= minWidth && newSidebarWidth <= maxWidth) {
                sidebar.style.width = `${newSidebarWidth}px`;
                sidebar.style.flex = 'none';
                
                // Ensure sidebar is visible when resizing
                if (sidebar.classList.contains('collapsed')) {
                    this.showSidebarIfHidden();
                }
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                horizontalSplitter.classList.remove('active');
                
                // Update toggle button state after resize
                this.updateToggleButtonStates();
            }
        });
        
        // Keyboard accessibility
        horizontalSplitter.setAttribute('tabindex', '0');
        horizontalSplitter.setAttribute('role', 'separator');
        horizontalSplitter.setAttribute('aria-label', 'Resize sidebar');
        
        horizontalSplitter.addEventListener('keydown', (e) => {
            const step = 20; // pixels to move per keypress
            let deltaX = 0;
            
            switch(e.key) {
                case 'ArrowLeft':
                    deltaX = -step;
                    break;
                case 'ArrowRight':
                    deltaX = step;
                    break;
                case 'Home':
                    // Reset to default width
                    sidebar.style.width = '280px';
                    sidebar.style.flex = 'none';
                    this.showSidebarIfHidden();
                    this.updateToggleButtonStates();
                    e.preventDefault();
                    return;
                default:
                    return;
            }
            
            e.preventDefault();
            
            // Apply keyboard movement
            const currentWidth = sidebar.offsetWidth;
            const newWidth = currentWidth + deltaX;
            
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.5;
            
            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = `${newWidth}px`;
                sidebar.style.flex = 'none';
                
                // Ensure sidebar is visible when resizing
                if (sidebar.classList.contains('collapsed')) {
                    this.showSidebarIfHidden();
                }
                this.updateToggleButtonStates();
            }
        });
        
        // Double-click to reset to default width
        horizontalSplitter.addEventListener('dblclick', () => {
            sidebar.style.width = '280px';
            sidebar.style.flex = 'none';
            this.showSidebarIfHidden();
            this.updateToggleButtonStates();
        });
    }

    updateToggleButtonStates() {
        const sidebar = document.getElementById('sidebar');
        const splitterToggleBtn = document.getElementById('splitterToggleBtn');
        const floatingToggleBtn = document.getElementById('floatingToggleBtn');
        const toggleSidebarBtn = document.getElementById('toggleSidebar');
        
        const isCollapsed = sidebar.classList.contains('collapsed');
        
        // Update splitter toggle button
        if (splitterToggleBtn) {
            if (isCollapsed) {
                splitterToggleBtn.classList.add('collapsed');
                splitterToggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                splitterToggleBtn.title = 'Show Sidebar';
            } else {
                splitterToggleBtn.classList.remove('collapsed');
                splitterToggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                splitterToggleBtn.title = 'Hide Sidebar';
            }
        }
        
        // Update floating toggle button
        if (floatingToggleBtn) {
            floatingToggleBtn.style.display = isCollapsed ? 'flex' : 'none';
        }
        
        // Update toolbar toggle button
        if (toggleSidebarBtn) {
            if (isCollapsed) {
                toggleSidebarBtn.classList.add('active');
                toggleSidebarBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                toggleSidebarBtn.classList.remove('active');
                toggleSidebarBtn.innerHTML = '<i class="fas fa-sidebar"></i>';
            }
        }
    }

    toggleSidebarFromSplitter() {
        this.toggleSidebar();
    }

    // Make track content draggable for navigation
    makeDraggable(element, chromosome) {
        let isDragging = false;
        let startX = 0;
        let startPosition = 0;
        let dragThreshold = 5; // Minimum pixels to move before considering it a drag
        let hasDragged = false;
        let lastUpdateX = 0; // Track last update position to prevent excessive updates
        
        element.style.cursor = 'grab';
        element.title = 'Drag left or right to navigate through the genome\nKeyboard: ← → arrows, Home, End';
        
        const handleMouseDown = (e) => {
            // Only handle left mouse button
            if (e.button !== 0) return;
            
            // Don't start dragging if a splitter is being resized
            if (document.body.hasAttribute('data-splitter-resizing')) return;
            
            isDragging = true;
            hasDragged = false;
            startX = e.clientX;
            lastUpdateX = e.clientX;
            startPosition = this.currentPosition.start;
            element.style.cursor = 'grabbing';
            element.classList.add('dragging');
            
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        };
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            // Don't update if a splitter is being resized
            if (document.body.hasAttribute('data-splitter-resizing')) return;
            
            const deltaX = e.clientX - startX;
            
            // Check if we've moved enough to consider this a drag
            if (Math.abs(deltaX) > dragThreshold) {
                hasDragged = true;
            }
            
            if (!hasDragged) return;
            
            // Only update if mouse moved significantly since last update
            const deltaFromLastUpdate = Math.abs(e.clientX - lastUpdateX);
            if (deltaFromLastUpdate < 3) return; // Reduce update frequency
            
            lastUpdateX = e.clientX;
            
            // Calculate movement with much more conservative approach
            const currentRange = this.currentPosition.end - this.currentPosition.start;
            const elementWidth = element.offsetWidth || 800; // fallback width
            const sequence = this.currentSequence[chromosome];
            
            // Calculate how much of the genome each pixel represents
            // Use a much smaller sensitivity factor for fine control
            const genomeFraction = currentRange / sequence.length; // What fraction of genome is currently visible
            const pixelMovement = deltaX; // Total pixel movement from start
            
            // Convert pixel movement to genome position change
            // Use a very conservative multiplier to prevent jumping
            const movementFactor = 1.50; // Increased from 0.05 for better responsiveness
            const positionChange = Math.round(pixelMovement * currentRange * movementFactor / elementWidth);
            
            // Calculate new position (drag right = move left in genome, drag left = move right)
            const newStart = Math.max(0, Math.min(
                sequence.length - currentRange,
                startPosition - positionChange
            ));
            const newEnd = newStart + currentRange;
            
            // Only update if position actually changed
            if (newStart !== this.currentPosition.start) {
                this.currentPosition = { start: newStart, end: newEnd };
                
                // Throttle updates for better performance
                if (!this.dragUpdateTimeout) {
                    this.dragUpdateTimeout = setTimeout(() => {
                        this.updateStatistics(chromosome, sequence);
                        this.displayGenomeView(chromosome, sequence);
                        this.dragUpdateTimeout = null;
                    }, 32); // Reduced frequency for smoother performance
                }
            }
        };
        
        const handleMouseUp = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            element.style.cursor = 'grab';
            element.classList.remove('dragging');
            document.body.style.userSelect = '';
            
            // If we didn't drag much, allow click events to propagate
            if (!hasDragged) {
                // Let click events on gene elements work normally
                return;
            }
            
            // Final update after drag ends
            if (this.dragUpdateTimeout) {
                clearTimeout(this.dragUpdateTimeout);
                this.dragUpdateTimeout = null;
            }
            
            const sequence = this.currentSequence[chromosome];
            this.updateStatistics(chromosome, sequence);
            this.displayGenomeView(chromosome, sequence);
            
            e.preventDefault();
            e.stopPropagation();
        };
        
        const handleMouseLeave = () => {
            if (isDragging) {
                handleMouseUp();
            }
        };
        
        // Add event listeners
        element.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        element.addEventListener('mouseleave', handleMouseLeave);
        
        // Add keyboard navigation
        element.setAttribute('tabindex', '0');
        element.addEventListener('keydown', (e) => {
            const sequence = this.currentSequence[chromosome];
            const currentRange = this.currentPosition.end - this.currentPosition.start;
            const step = Math.max(1, Math.floor(currentRange * 0.1)); // 10% of current view
            
            let newStart = this.currentPosition.start;
            
            switch(e.key) {
                case 'ArrowLeft':
                    newStart = Math.max(0, this.currentPosition.start - step);
                    break;
                case 'ArrowRight':
                    newStart = Math.min(sequence.length - currentRange, this.currentPosition.start + step);
                    break;
                case 'Home':
                    newStart = 0;
                    break;
                case 'End':
                    newStart = Math.max(0, sequence.length - currentRange);
                    break;
                default:
                    return; // Don't prevent default for other keys
            }
            
            e.preventDefault();
            
            const newEnd = newStart + currentRange;
            this.currentPosition = { start: newStart, end: newEnd };
            this.updateStatistics(chromosome, sequence);
            this.displayGenomeView(chromosome, sequence);
        });
        
        // Store cleanup function for later removal if needed
        element._dragCleanup = () => {
            element.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            element.removeEventListener('mouseleave', handleMouseLeave);
        };
    }

    // Create a resizable splitter between tracks
    createTrackSplitter(topTrackType, bottomTrackType) {
        const splitter = document.createElement('div');
        splitter.className = 'track-splitter';
        splitter.setAttribute('data-top-track', topTrackType);
        splitter.setAttribute('data-bottom-track', bottomTrackType);
        
        // Add visual indicator
        const handle = document.createElement('div');
        handle.className = 'track-splitter-handle';
        handle.innerHTML = '⋯';
        splitter.appendChild(handle);
        
        // Add resize functionality
        this.makeTrackSplitterResizable(splitter);
        
        return splitter;
    }

    // Make track splitter resizable
    makeTrackSplitterResizable(splitter) {
        let isResizing = false;
        let startY = 0;
        let startTopHeight = 0;
        let startBottomHeight = 0;
        let topTrack = null;
        let bottomTrack = null;
        
        const startResize = (e) => {
            isResizing = true;
            startY = e.clientY || e.touches[0].clientY;
            
            // Set a global flag to prevent track content dragging during splitter resize
            document.body.setAttribute('data-splitter-resizing', 'true');
            
            // Find the tracks above and below this splitter
            topTrack = splitter.previousElementSibling;
            bottomTrack = splitter.nextElementSibling;
            
            if (topTrack && bottomTrack) {
                const topContent = topTrack.querySelector('.track-content');
                const bottomContent = bottomTrack.querySelector('.track-content');
                
                if (topContent && bottomContent) {
                    startTopHeight = topContent.offsetHeight;
                    startBottomHeight = bottomContent.offsetHeight;
                }
            }
            
            splitter.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        };
        
        const doResize = (e) => {
            if (!isResizing || !topTrack || !bottomTrack) return;
            
            const currentY = e.clientY || e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            const topContent = topTrack.querySelector('.track-content');
            const bottomContent = bottomTrack.querySelector('.track-content');
            
            if (topContent && bottomContent) {
                // Calculate new heights
                const newTopHeight = startTopHeight + deltaY;
                const newBottomHeight = startBottomHeight - deltaY;
                
                // Set minimum heights
                const minHeight = 40;
                
                if (newTopHeight >= minHeight && newBottomHeight >= minHeight) {
                    topContent.style.height = `${newTopHeight}px`;
                    bottomContent.style.height = `${newBottomHeight}px`;
                }
            }
            
            e.preventDefault();
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            splitter.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Remove the global flag to allow track content dragging again
            document.body.removeAttribute('data-splitter-resizing');
            
            topTrack = null;
            bottomTrack = null;
        };
        
        // Auto-adjust height calculation - triggered on double-click
        const autoAdjustHeight = () => {
            const topTrack = splitter.previousElementSibling;
            const bottomTrack = splitter.nextElementSibling;
            
            if (topTrack && bottomTrack) {
                const topContent = topTrack.querySelector('.track-content');
                const bottomContent = bottomTrack.querySelector('.track-content');
                
                if (topContent && bottomContent) {
                    // Add visual feedback
                    splitter.classList.add('auto-adjusting');
                    
                    // Calculate optimal height for top track based on its content
                    let optimalHeight = 80;
                    
                    // Get track type from data attributes
                    const topTrackType = splitter.getAttribute('data-top-track');
                    
                    switch (topTrackType) {
                        case 'genes':
                            const geneElements = topContent.querySelectorAll('.gene-element');
                            if (geneElements.length > 0) {
                                let maxRow = 0;
                                let elementHeight = 23;
                                geneElements.forEach(gene => {
                                    const top = parseInt(gene.style.top) || 0;
                                    const height = parseInt(gene.style.height) || elementHeight;
                                    maxRow = Math.max(maxRow, top + height);
                                });
                                optimalHeight = Math.max(100, maxRow + 60);
                            } else {
                                optimalHeight = 100;
                            }
                            break;
                        case 'reads':
                            const readElements = topContent.querySelectorAll('.read-element');
                            if (readElements.length > 0) {
                                let maxRow = 0;
                                let elementHeight = 12;
                                readElements.forEach(read => {
                                    const top = parseInt(read.style.top) || 0;
                                    const height = parseInt(read.style.height) || elementHeight;
                                    maxRow = Math.max(maxRow, top + height);
                                });
                                optimalHeight = Math.max(80, maxRow + 40);
                            } else {
                                optimalHeight = 80;
                            }
                            break;
                        case 'gc':
                            optimalHeight = 100;
                            break;
                        case 'variants':
                            const variantElements = topContent.querySelectorAll('.variant-element');
                            if (variantElements.length > 0) {
                                optimalHeight = 80;
                            } else {
                                optimalHeight = 60;
                            }
                            break;
                        case 'proteins':
                            const proteinElements = topContent.querySelectorAll('.protein-element');
                            if (proteinElements.length > 0) {
                                let maxRow = 0;
                                let elementHeight = 21;
                                proteinElements.forEach(protein => {
                                    const top = parseInt(protein.style.top) || 0;
                                    const height = parseInt(protein.style.height) || elementHeight;
                                    maxRow = Math.max(maxRow, top + height);
                                });
                                optimalHeight = Math.max(90, maxRow + 50);
                            } else {
                                optimalHeight = 90;
                            }
                            break;
                        default:
                            optimalHeight = 80;
                    }
                    
                    // Apply the optimal height with smooth transition
                    topContent.style.transition = 'height 0.3s ease';
                    topContent.style.height = `${optimalHeight}px`;
                    
                    // Remove transition and animation classes after animation completes
                    setTimeout(() => {
                        topContent.style.transition = '';
                        splitter.classList.remove('auto-adjusting');
                    }, 300);
                }
            }
        };
        
        // Mouse events
        splitter.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        
        // Touch events for mobile
        splitter.addEventListener('touchstart', startResize, { passive: false });
        document.addEventListener('touchmove', doResize, { passive: false });
        document.addEventListener('touchend', stopResize);
        
        // Double-click for auto-adjust
        splitter.addEventListener('dblclick', autoAdjustHeight);
        
        // Make splitter focusable for keyboard navigation
        splitter.setAttribute('tabindex', '0');
        splitter.addEventListener('keydown', (e) => {
            const step = 10; // pixels to move per keypress
            let deltaY = 0;
            
            switch(e.key) {
                case 'ArrowUp':
                    deltaY = -step;
                    break;
                case 'ArrowDown':
                    deltaY = step;
                    break;
                case 'Home':
                    autoAdjustHeight();
                    e.preventDefault();
                    return;
                default:
                    return;
            }
            
            e.preventDefault();
            
            // Apply keyboard movement
            const topTrack = splitter.previousElementSibling;
            const bottomTrack = splitter.nextElementSibling;
            
            if (topTrack && bottomTrack) {
                const topContent = topTrack.querySelector('.track-content');
                const bottomContent = bottomTrack.querySelector('.track-content');
                
                if (topContent && bottomContent) {
                    const currentTopHeight = topContent.offsetHeight;
                    const currentBottomHeight = bottomContent.offsetHeight;
                    
                    const newTopHeight = currentTopHeight + deltaY;
                    const newBottomHeight = currentBottomHeight - deltaY;
                    
                    const minHeight = 40;
                    
                    if (newTopHeight >= minHeight && newBottomHeight >= minHeight) {
                        topContent.style.height = `${newTopHeight}px`;
                        bottomContent.style.height = `${newBottomHeight}px`;
                    }
                }
            }
        });
    }

    toggleSequencePanel() {
        const sequenceContent = document.getElementById('sequenceContent');
        const toggleButton = document.getElementById('toggleSequencePanel');
        const splitter = document.getElementById('splitter');
        const sequenceSection = document.getElementById('sequenceDisplaySection');
        
        if (sequenceContent.style.display === 'none') {
            // Show sequence content
            sequenceContent.style.display = 'flex';
            toggleButton.innerHTML = '<i class="fas fa-chevron-down"></i>';
            toggleButton.title = 'Hide Sequence Panel';
            
            // Restore splitter functionality
            splitter.style.display = 'flex';
            
            // Restore section height
            sequenceSection.style.minHeight = '200px';
            sequenceSection.style.maxHeight = '60vh';
        } else {
            // Hide sequence content
            sequenceContent.style.display = 'none';
            toggleButton.innerHTML = '<i class="fas fa-chevron-up"></i>';
            toggleButton.title = 'Show Sequence Panel';
            
            // Hide splitter when content is hidden
            splitter.style.display = 'none';
            
            // Minimize section height to just show header
            sequenceSection.style.minHeight = 'auto';
            sequenceSection.style.maxHeight = 'auto';
            
            // Reset genome section to take full space
            const genomeSection = document.getElementById('genomeViewerSection');
            genomeSection.style.flex = '1';
            genomeSection.style.height = 'auto';
        }
        
        // Trigger resize event for layout adjustment
        window.dispatchEvent(new Event('resize'));
    }

    // Populate the search results panel
    populateSearchResults(results, searchQuery) {
        const searchResultsSection = document.getElementById('searchResultsSection');
        const searchResultsList = document.getElementById('searchResultsList');
        
        if (results.length === 0) {
            searchResultsList.innerHTML = '<p class="no-results">No search results</p>';
            searchResultsSection.style.display = 'none';
            return;
        }
        
        // Show the search results panel at the top
        searchResultsSection.style.display = 'block';
        
        // Create header
        let html = `<div class="search-results-header">Found ${results.length} match${results.length > 1 ? 'es' : ''} for "${searchQuery}"</div>`;
        
        // Create result items
        results.forEach((result, index) => {
            html += `
                <div class="search-result-item" data-index="${index}">
                    <div class="search-result-header">
                        <span class="search-result-name">${result.name}</span>
                        <span class="search-result-type ${result.type}">${result.type}</span>
                    </div>
                    <div class="search-result-position">Position: ${result.position + 1}-${result.end}</div>
                    <div class="search-result-details">${result.details}</div>
                </div>
            `;
        });
        
        searchResultsList.innerHTML = html;
        
        // Add click handlers for navigation
        searchResultsList.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.navigateToSearchResult(index);
                
                // Highlight selected result
                searchResultsList.querySelectorAll('.search-result-item').forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
            });
        });
        
        // Highlight first result as selected
        const firstItem = searchResultsList.querySelector('.search-result-item');
        if (firstItem) {
            firstItem.classList.add('selected');
        }
    }

    // Navigate to a specific search result
    navigateToSearchResult(index) {
        if (!this.searchResults || index < 0 || index >= this.searchResults.length) return;
        
        const result = this.searchResults[index];
        const currentChr = document.getElementById('chromosomeSelect').value;
        const sequence = this.currentSequence[currentChr];
        
        // Calculate view range with context
        const start = Math.max(0, result.position - 500);
        const end = Math.min(sequence.length, result.end + 500);
        
        this.currentPosition = { start, end };
        this.updateStatistics(currentChr, sequence);
        this.displayGenomeView(currentChr, sequence);
        
        this.currentSearchIndex = index;
        
        // Update status
        this.updateStatus(`Showing result ${index + 1} of ${this.searchResults.length}: ${result.name}`);
    }

    // Helper to darken/lighten a hex color
    shadeColor(color, percent) {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);

        R = parseInt(R * (100 + percent) / 100);
        G = parseInt(G * (100 + percent) / 100);
        B = parseInt(B * (100 + percent) / 100);

        R = (R < 255) ? R : 255;
        G = (G < 255) ? G : 255;
        B = (B < 255) ? B : 255;

        R = (R > 0) ? R : 0;
        G = (G > 0) ? G : 0;
        B = (B > 0) ? B : 0;

        const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
        const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
        const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

        return "#" + RR + GG + BB;
    }

    // Helper function to convert hex color to RGBA
    hexToRgba(hex, alpha) {
        if (!hex) return 'transparent'; // Fallback for safety
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        if (typeof alpha === 'number' && alpha >= 0 && alpha <= 1) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgb(${r}, ${g}, ${b})`; // Fallback to RGB if alpha is invalid
    }

    // Initialize main vertical splitter functionality (was missing)
    initializeSplitter() {
        const splitter = document.getElementById('splitter');
        const genomeViewerSection = document.getElementById('genomeViewerSection');
        const sequenceDisplaySection = document.getElementById('sequenceDisplaySection');
        
        if (!splitter || !genomeViewerSection || !sequenceDisplaySection) {
            console.warn('Main vertical splitter elements not found, skipping initialization');
            return;
        }
        
        let isResizing = false;
        let startY = 0;
        let startGenomeHeight = 0;
        
        const startResize = (e) => {
            isResizing = true;
            startY = e.clientY;
            startGenomeHeight = genomeViewerSection.offsetHeight;
            
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            splitter.classList.add('active');
            
            e.preventDefault();
        };
        
        const doResize = (e) => {
            if (!isResizing) return;
            
            const deltaY = e.clientY - startY;
            const newGenomeHeight = Math.max(100, startGenomeHeight + deltaY);
            
            // Set the genome viewer section height using flex-basis
            genomeViewerSection.style.flexGrow = '0';
            genomeViewerSection.style.flexBasis = `${newGenomeHeight}px`;
            
            // Let the sequence section fill the rest (it has flex-grow: 1 from CSS)
            
            e.preventDefault();
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            splitter.classList.remove('active');
        };
        
        // Mouse events
        splitter.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        
        // Touch events for mobile
        splitter.addEventListener('touchstart', startResize);
        document.addEventListener('touchmove', doResize);
        document.addEventListener('touchend', stopResize);
        
        // Keyboard accessibility
        splitter.setAttribute('tabindex', '0');
        splitter.setAttribute('role', 'separator');
        splitter.setAttribute('aria-label', 'Resize genome viewer and sequence panels');
        
        splitter.addEventListener('keydown', (e) => {
            const step = 20;
            let deltaY = 0;
            
            switch(e.key) {
                case 'ArrowUp':
                    deltaY = -step;
                    break;
                case 'ArrowDown':
                    deltaY = step;
                    break;
                case 'Home':
                    // Reset to default 50/50 split
                    genomeViewerSection.style.flexGrow = '0';
                    genomeViewerSection.style.flexBasis = '50%';
                    e.preventDefault();
                    return;
                default:
                    return;
            }
            
            e.preventDefault();
            
            const currentHeight = genomeViewerSection.offsetHeight;
            const newHeight = Math.max(100, currentHeight + deltaY);
            
            genomeViewerSection.style.flexGrow = '0';
            genomeViewerSection.style.flexBasis = `${newHeight}px`;
        });
        
        // Double-click to reset to default
        splitter.addEventListener('dblclick', () => {
            genomeViewerSection.style.flexGrow = '0';
            genomeViewerSection.style.flexBasis = '50%';
        });
    }

    showSidebarIfHidden() {
        const sidebar = document.querySelector('.sidebar');
        const horizontalSplitter = document.getElementById('horizontalSplitter');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            if (horizontalSplitter) {
                horizontalSplitter.style.display = 'flex';
            }
            if (mainContent) {
                mainContent.classList.remove('sidebar-collapsed');
            }
            
            // Update splitter toggle button
            const toggleBtn = document.getElementById('splitterToggleBtn');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                toggleBtn.classList.remove('collapsed');
            }
        }
    }

    // User-defined features functionality
    initializeUserFeatures() {
        // Add features dropdown toggle
        document.getElementById('addFeaturesBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleAddFeaturesDropdown();
        });
        
        // Dropdown feature buttons
        document.querySelectorAll('.dropdown-feature-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const featureType = btn.getAttribute('data-type');
                this.showAddFeatureModal(featureType);
                this.hideAddFeaturesDropdown();
            });
        });
        
        // Add feature modal
        document.getElementById('addFeatureBtn')?.addEventListener('click', () => this.addUserFeature());
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => this.hideAddFeaturesDropdown());
        
        // Enable sequence selection in bottom panel
        this.initializeSequenceSelection();
    }

    toggleAddFeaturesDropdown() {
        const dropdown = document.getElementById('addFeaturesDropdown');
        const button = document.getElementById('addFeaturesBtn');
        
        if (dropdown && button) {
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            button.classList.toggle('active', !isVisible);
        }
    }

    hideAddFeaturesDropdown() {
        const dropdown = document.getElementById('addFeaturesDropdown');
        const button = document.getElementById('addFeaturesBtn');
        
        if (dropdown && button) {
            dropdown.style.display = 'none';
            button.classList.remove('active');
        }
    }

    showAddFeatureModal(featureType = 'gene') {
        const modal = document.getElementById('addFeatureModal');
        const titleElement = document.getElementById('addFeatureModalTitle');
        const typeSelect = document.getElementById('featureType');
        const chromosomeSelect = document.getElementById('featureChromosome');
        const selectionInfo = document.getElementById('sequenceSelectionInfo');
        
        if (!modal) return;
        
        // Set modal title and feature type
        titleElement.textContent = `Add ${featureType.charAt(0).toUpperCase() + featureType.slice(1)}`;
        typeSelect.value = featureType;
        
        // Populate chromosome dropdown
        this.populateChromosomeSelectForFeature(chromosomeSelect);
        
        // Handle sequence selection
        if (this.currentSequenceSelection) {
            const { chromosome, start, end } = this.currentSequenceSelection;
            document.getElementById('featureChromosome').value = chromosome;
            document.getElementById('featureStart').value = start;
            document.getElementById('featureEnd').value = end;
            document.getElementById('selectionText').textContent = 
                `Using selected region: ${chromosome}:${start}-${end} (${end - start + 1} bp)`;
            selectionInfo.style.display = 'block';
        } else {
            // Use current view if no selection
            const currentChr = document.getElementById('chromosomeSelect')?.value;
            if (currentChr) {
                document.getElementById('featureChromosome').value = currentChr;
                document.getElementById('featureStart').value = this.currentPosition.start + 1;
                document.getElementById('featureEnd').value = this.currentPosition.end;
            }
            selectionInfo.style.display = 'none';
        }
        
        // Clear previous values
        document.getElementById('featureName').value = '';
        document.getElementById('featureDescription').value = '';
        
        // Show modal
        modal.classList.add('show');
    }

    populateChromosomeSelectForFeature(selectElement) {
        if (!selectElement) return;
        
        selectElement.innerHTML = '';
        
        // Add chromosomes from current sequence data
        if (this.currentSequence) {
            Object.keys(this.currentSequence).forEach(chr => {
                const option = document.createElement('option');
                option.value = chr;
                option.textContent = chr;
                selectElement.appendChild(option);
            });
        }
    }

    addUserFeature() {
        const featureType = document.getElementById('featureType').value;
        const featureName = document.getElementById('featureName').value.trim();
        const chromosome = document.getElementById('featureChromosome').value;
        const start = parseInt(document.getElementById('featureStart').value);
        const end = parseInt(document.getElementById('featureEnd').value);
        const strand = parseInt(document.getElementById('featureStrand').value);
        const description = document.getElementById('featureDescription').value.trim();
        
        // Validation
        if (!featureName) {
            alert('Please enter a feature name');
            return;
        }
        
        if (!chromosome) {
            alert('Please select a chromosome');
            return;
        }
        
        if (isNaN(start) || isNaN(end) || start < 1 || end < 1) {
            alert('Please enter valid start and end positions');
            return;
        }
        
        if (start > end) {
            alert('Start position must be less than or equal to end position');
            return;
        }
        
        // Check if position is within sequence bounds
        if (this.currentSequence[chromosome]) {
            const seqLength = this.currentSequence[chromosome].length;
            if (end > seqLength) {
                alert(`End position (${end}) exceeds sequence length (${seqLength})`);
                return;
            }
        }
        
        // Create the feature object
        const feature = {
            type: featureType,
            start: start,
            end: end,
            strand: strand,
            qualifiers: {
                gene: featureName,
                product: description || featureName,
                note: description,
                user_defined: true
            },
            userDefined: true,
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Store the feature
        if (!this.userDefinedFeatures[chromosome]) {
            this.userDefinedFeatures[chromosome] = [];
        }
        this.userDefinedFeatures[chromosome].push(feature);
        
        // Add to current annotations for immediate display
        if (!this.currentAnnotations[chromosome]) {
            this.currentAnnotations[chromosome] = [];
        }
        this.currentAnnotations[chromosome].push(feature);
        
        // Close modal
        document.getElementById('addFeatureModal').classList.remove('show');
        
        // Clear selection
        this.clearSequenceSelection();
        
        // Refresh the view
        if (chromosome === document.getElementById('chromosomeSelect')?.value) {
            this.displayGenomeView(chromosome, this.currentSequence[chromosome]);
            this.displayEnhancedSequence(chromosome, this.currentSequence[chromosome]);
        }
        
        alert(`Added ${featureType} "${featureName}" to ${chromosome}:${start}-${end}`);
    }

    initializeSequenceSelection() {
        // Add selection capability to sequence content in bottom panel
        const sequenceContent = document.getElementById('sequenceContent');
        if (!sequenceContent) return;
        
        // Remove any existing listeners to prevent duplicates
        if (this._sequenceSelectionListeners) {
            sequenceContent.removeEventListener('mousedown', this._sequenceSelectionListeners.mousedown);
            sequenceContent.removeEventListener('mousemove', this._sequenceSelectionListeners.mousemove);
            sequenceContent.removeEventListener('mouseup', this._sequenceSelectionListeners.mouseup);
            document.removeEventListener('mouseup', this._sequenceSelectionListeners.docMouseup);
        }
        
        let isSelecting = false;
        let selectionStart = null;
        let selectionEnd = null;
        
        const mousedownHandler = (e) => {
            if (e.target.matches('.sequence-bases span')) {
                isSelecting = true;
                selectionStart = this.getSequencePosition(e.target);
                // Clear all existing selections when starting a new manual selection
                this.clearAllSelections();
                e.preventDefault();
            }
        };
        
        const mousemoveHandler = (e) => {
            if (isSelecting && e.target.matches('.sequence-bases span')) {
                selectionEnd = this.getSequencePosition(e.target);
                this.updateSequenceSelection(selectionStart, selectionEnd);
            }
        };
        
        const mouseupHandler = () => {
            if (isSelecting && selectionStart && selectionEnd) {
                this.finalizeSequenceSelection(selectionStart, selectionEnd);
            }
            isSelecting = false;
        };
        
        const docMouseupHandler = () => {
            isSelecting = false;
        };
        
        // Store listeners for cleanup
        this._sequenceSelectionListeners = {
            mousedown: mousedownHandler,
            mousemove: mousemoveHandler,
            mouseup: mouseupHandler,
            docMouseup: docMouseupHandler
        };
        
        // Add event listeners
        sequenceContent.addEventListener('mousedown', mousedownHandler);
        sequenceContent.addEventListener('mousemove', mousemoveHandler);
        sequenceContent.addEventListener('mouseup', mouseupHandler);
        document.addEventListener('mouseup', docMouseupHandler);
    }

    getSequencePosition(baseElement) {
        const parentLine = baseElement.closest('.sequence-line');
        if (!parentLine) return null;
        
        const positionElement = parentLine.querySelector('.sequence-position');
        if (!positionElement) return null;
        
        const lineStartPos = parseInt(positionElement.textContent.replace(/,/g, ''));
        const baseIndex = Array.from(parentLine.querySelectorAll('.sequence-bases span')).indexOf(baseElement);
        
        return {
            chromosome: document.getElementById('chromosomeSelect')?.value,
            position: lineStartPos + baseIndex,
            element: baseElement
        };
    }

    updateSequenceSelection(start, end) {
        if (!start || !end) return;
        
        this.clearSequenceSelection();
        
        const startPos = Math.min(start.position, end.position);
        const endPos = Math.max(start.position, end.position);
        
        // Highlight selected bases
        const sequenceBases = document.querySelectorAll('.sequence-bases span');
        sequenceBases.forEach(baseElement => {
            const pos = this.getSequencePosition(baseElement);
            if (pos && pos.position >= startPos && pos.position <= endPos) {
                baseElement.classList.add('sequence-selection');
            }
        });
    }

    finalizeSequenceSelection(start, end) {
        if (!start || !end) return;
        
        const startPos = Math.min(start.position, end.position);
        const endPos = Math.max(start.position, end.position);
        
        this.currentSequenceSelection = {
            chromosome: start.chromosome,
            start: startPos,
            end: endPos
        };
        
        console.log(`Selected sequence: ${start.chromosome}:${startPos}-${endPos} (${endPos - startPos + 1} bp)`);
    }

    clearSequenceSelection() {
        this.currentSequenceSelection = null;
        const selectedBases = document.querySelectorAll('.sequence-selection');
        selectedBases.forEach(el => el.classList.remove('sequence-selection'));
    }

    clearAllSelections() {
        // Clear gene selection (this clears both gene selection and sequence highlights)
        this.clearGeneSelection();
        // Clear manual sequence selection
        this.clearSequenceSelection();
    }
}

// Initialize the Genome AI Studio when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.genomeBrowser = new GenomeBrowser();
}); 