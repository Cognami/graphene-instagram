package graphene.instagram.web.pages.experimental;

import graphene.augment.snlp.model.NERResult;
import graphene.augment.snlp.services.NERService;
import graphene.model.idl.G_VisualType;
import graphene.web.annotations.PluginPage;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

import org.apache.tapestry5.annotations.Component;
import org.apache.tapestry5.annotations.Import;
import org.apache.tapestry5.annotations.InjectComponent;
import org.apache.tapestry5.annotations.Persist;
import org.apache.tapestry5.annotations.Property;
import org.apache.tapestry5.corelib.components.Form;
import org.apache.tapestry5.corelib.components.Zone;
import org.apache.tapestry5.ioc.annotations.Inject;
import org.apache.tapestry5.services.Request;
import org.apache.tapestry5.services.ajax.AjaxResponseRenderer;
import org.apache.tapestry5.upload.services.UploadedFile;
import org.slf4j.Logger;

@PluginPage(visualType = G_VisualType.PLUGIN, menuName = "NER", icon = "fa fa-lg fa-fw fa-comments")
@Import(library = { "context:core/js/plugin/dropzone/dropzone.js",
		"context:/core/js/startdropzone.js" })
public class NER {
	@Inject
	private AjaxResponseRenderer ajaxResponseRenderer;
	@Property
	private NERResult currentResult;
	@Property
	private UploadedFile file;
	@Property
	@Persist
	private boolean highlightZoneUpdates;
	@Property
	private int index;
	@InjectComponent
	private Zone listZone;
	@Component
	private Form mydropzone;

	@Inject
	private Logger logger;

	@Inject
	private Request request;

	@Persist
	private List<NERResult> nerresults;

	public List<NERResult> getResults() {
		return nerresults;
	}

	@Inject
	private NERService nerService;

	public String getZoneUpdateFunction() {
		return highlightZoneUpdates ? "highlight" : "show";
	}

	void setupRender() {

	}

	public Object onSuccess() {

		BufferedReader br = new BufferedReader(new InputStreamReader(
				file.getStream()));
		String line;
		nerresults = new ArrayList<NERResult>();
		try {
			while ((line = br.readLine()) != null) {
				logger.debug(line);
				nerresults.addAll(nerService.getResults(line));
			}
			logger.debug("Done extracting entities");
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}

		return request.isXHR() ? listZone.getBody() : null;
	}
}
